import { createId, type Versioned } from "@vtt/shared";

/**
 * Valori non deterministici usati da un'operazione. Alla prima esecuzione vengono generati e registrati;
 * quando l'operazione viene riapplicata (conflitto o aggiornamento remoto) restituiscono gli stessi valori.
 */
export interface OpContext {
  id(): string;
  rng(): number;
}

/** Trasformazione pura del documento: deve poter essere rieseguita su una versione più recente. */
export type Op<T> = (doc: T, ctx: OpContext) => T;

export type SaveResult<T> = { status: "ok"; rev: number } | { status: "conflict"; current: Versioned<T> } | { status: "gone" };

export interface DocSyncOptions<T> {
  /** Salva `doc` dichiarando la versione su cui si basa (If-Match). */
  save: (doc: T, baseRev: number) => Promise<SaveResult<T>>;
  /** Il documento visibile è cambiato (modifica locale, rebase o aggiornamento remoto). */
  onChange: (doc: T) => void;
  /** Il documento è stato eliminato altrove: le modifiche locali vengono scartate. */
  onGone?: () => void;
  onError?: (err: unknown) => void;
  delayMs: number;
  /** Attesa prima di riprovare dopo un errore di rete. */
  retryMs?: number;
  /** Gli stati intermedi non validi (es. nome vuoto durante la digitazione) non vengono inviati. */
  canSave?: (doc: T) => boolean;
  /** Errori per cui riprovare è inutile (es. 400): le operazioni vengono scartate. */
  isPermanent?: (err: unknown) => boolean;
  /** Per un documento appena creato: risolve con la prima versione quando il server l'ha registrato. */
  ready?: Promise<number>;
}

interface RecordedOp<T> {
  run: (doc: T) => T;
}

const MAX_CONFLICT_RETRIES = 5;

function record<T>(fn: Op<T>): RecordedOp<T> {
  const ids: string[] = [];
  const randoms: number[] = [];
  return {
    run(doc) {
      let i = 0;
      let j = 0;
      const ctx: OpContext = {
        id: () => {
          if (i === ids.length) ids.push(createId());
          return ids[i++]!;
        },
        rng: () => {
          if (j === randoms.length) randoms.push(Math.random());
          return randoms[j++]!;
        },
      };
      return fn(doc, ctx);
    },
  };
}

const replay = <T>(base: T, ops: readonly RecordedOp<T>[]) => ops.reduce((doc, op) => op.run(doc), base);

/**
 * Sincronizza un documento con il server senza mai sovrascrivere versioni più recenti.
 *
 * Il valore visibile è sempre `base` (ultima versione nota del server) + le operazioni locali non ancora confermate.
 * Su conflitto, o quando arriva una versione più recente da un altro tab, le operazioni locali vengono
 * riapplicate sopra la nuova base: le modifiche di entrambi i tab sopravvivono.
 */
export class DocSync<T> {
  private base: T;
  private rev: number;
  private view: T;
  /** Operazioni inviate nel salvataggio in corso. */
  private inflight: RecordedOp<T>[] = [];
  /** Operazioni non ancora inviate. */
  private queue: RecordedOp<T>[] = [];
  /** Versione remota arrivata durante un salvataggio: si applica dopo la risposta. */
  private buffered: Versioned<T | null> | null = null;
  private saving: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ready: Promise<number> | null;
  private conflicts = 0;
  private gone = false;

  constructor(
    initial: Versioned<T>,
    private readonly opts: DocSyncOptions<T>,
  ) {
    this.base = initial.data;
    this.view = initial.data;
    this.rev = initial.rev;
    this.ready = opts.ready ?? null;
    this.ready?.then(
      (rev) => {
        this.ready = null;
        this.rev = Math.max(this.rev, rev);
        if (this.queue.length) this.schedule(0);
      },
      () => this.markGone(),
    );
  }

  get value(): T {
    return this.view;
  }

  get version(): number {
    return this.rev;
  }

  get hasPending(): boolean {
    return this.queue.length > 0 || this.inflight.length > 0;
  }

  get isGone(): boolean {
    return this.gone;
  }

  apply(fn: Op<T>): T {
    if (this.gone) return this.view;
    const op = record(fn);
    const next = op.run(this.view);
    if (next === this.view) return this.view;
    this.queue.push(op);
    this.setView(next);
    this.schedule(this.opts.delayMs);
    return next;
  }

  /** Versione arrivata dal server (evento in tempo reale o risincronizzazione). `data: null` = eliminato. */
  receive(remote: Versioned<T | null>): void {
    if (this.gone || remote.rev <= this.rev) return;
    if (this.saving) {
      if (!this.buffered || remote.rev > this.buffered.rev) this.buffered = remote;
      return;
    }
    this.rebase(remote);
  }

  /** Invia subito le operazioni in coda (es. alla chiusura della pagina). */
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    return this.send();
  }

  /** Scarta tutto (documento eliminato localmente). */
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.gone = true;
    this.queue = [];
  }

  private setView(next: T) {
    this.view = next;
    this.opts.onChange(next);
  }

  private rebase(remote: Versioned<T | null>) {
    if (remote.data === null) return this.markGone();
    this.base = remote.data;
    this.rev = remote.rev;
    this.setView(replay(this.base, [...this.inflight, ...this.queue]));
  }

  private markGone() {
    if (this.gone) return;
    this.dispose();
    this.inflight = [];
    this.opts.onGone?.();
  }

  private schedule(delay: number) {
    if (this.gone) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.send();
    }, delay);
  }

  private send(): Promise<void> {
    if (this.saving) return this.saving;
    if (this.gone || this.ready || this.queue.length === 0) return Promise.resolve();
    const body = this.view;
    if (this.opts.canSave && !this.opts.canSave(body)) return Promise.resolve();

    this.inflight = this.queue;
    this.queue = [];
    const baseRev = this.rev;
    this.saving = this.opts
      .save(body, baseRev)
      .then(
        (result) => this.onSaved(result, body),
        (err: unknown) => this.onFailed(err),
      )
      .finally(() => {
        this.saving = null;
        const buffered = this.buffered;
        this.buffered = null;
        if (buffered && !this.gone && buffered.rev > this.rev) this.rebase(buffered);
      });
    return this.saving;
  }

  private onSaved(result: SaveResult<T>, body: T) {
    if (result.status === "gone") return this.markGone();
    if (result.status === "ok") {
      this.conflicts = 0;
      if (result.rev > this.rev) {
        this.base = body;
        this.rev = result.rev;
      }
      this.inflight = [];
      if (this.queue.length) this.schedule(this.opts.delayMs);
      return;
    }
    // Conflitto: un altro tab ha salvato prima. Le nostre operazioni ripartono dalla sua versione.
    this.queue = [...this.inflight, ...this.queue];
    this.inflight = [];
    const newest = this.buffered && this.buffered.rev > result.current.rev ? this.buffered : result.current;
    this.buffered = null;
    this.rebase(newest);
    this.conflicts += 1;
    if (this.conflicts > MAX_CONFLICT_RETRIES) {
      this.conflicts = 0;
      this.opts.onError?.(new Error("Troppe modifiche concorrenti: riprovo tra poco"));
      this.schedule(this.opts.retryMs ?? 2000);
    } else {
      this.schedule(0);
    }
  }

  private onFailed(err: unknown) {
    this.opts.onError?.(err);
    if (this.opts.isPermanent?.(err)) {
      this.inflight = [];
      this.setView(replay(this.base, this.queue));
      return;
    }
    this.queue = [...this.inflight, ...this.queue];
    this.inflight = [];
    this.schedule(this.opts.retryMs ?? 2000);
  }
}
