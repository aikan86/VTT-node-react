import type { Versioned } from "@vtt/shared";
import { DocSync, type Op, type SaveResult } from "./docSync";

export interface CollectionApi<T> {
  list(): Promise<Versioned<T>[]>;
  create(doc: T): Promise<Versioned<T>>;
  /** Salvataggio condizionato alla versione (If-Match). */
  update(doc: T, baseRev: number): Promise<SaveResult<T>>;
  remove(id: string): Promise<void>;
}

export interface CollectionSyncOptions<T> {
  api: CollectionApi<T>;
  delayMs: number;
  onChange: (list: T[]) => void;
  onError: (err: unknown) => void;
  canSave?: (doc: T) => boolean;
  isPermanent?: (err: unknown) => boolean;
  retryMs?: number;
}

/** Collezione di documenti sincronizzati (uno `DocSync` per documento), nell'ordine del server. */
export class CollectionSync<T extends { id: string }> {
  private docs = new Map<string, DocSync<T>>();
  private order: string[] = [];

  constructor(private readonly opts: CollectionSyncOptions<T>) {}

  get list(): T[] {
    return this.order.flatMap((id) => {
      const doc = this.docs.get(id);
      return doc ? [doc.value] : [];
    });
  }

  get(id: string): T | undefined {
    return this.docs.get(id)?.value;
  }

  hydrate(list: Versioned<T>[]): void {
    for (const doc of this.docs.values()) doc.dispose();
    this.docs = new Map();
    this.order = [];
    for (const v of list) this.add(v);
    this.emit();
  }

  async load(): Promise<void> {
    this.hydrate(await this.opts.api.list());
  }

  /** Aggiunge subito il documento; le modifiche successive partono quando il server l'ha creato. */
  create(doc: T): Promise<void> {
    const created = this.opts.api.create(doc);
    this.add({ rev: 0, data: doc }, created.then((v) => v.rev));
    this.emit();
    return created.then(
      () => undefined,
      (err: unknown) => {
        this.opts.onError(err);
        throw err;
      },
    );
  }

  update(id: string, fn: Op<T>): void {
    this.docs.get(id)?.apply(fn);
  }

  async remove(id: string): Promise<void> {
    if (!this.drop(id)) return;
    this.emit();
    try {
      await this.opts.api.remove(id);
    } catch (err) {
      if ((err as { status?: number }).status === 404) return;
      this.opts.onError(err);
      await this.resync().catch(() => undefined);
    }
  }

  /** Modifica arrivata da un altro tab. */
  receive(change: { id: string; rev: number; data: T | null }): void {
    const doc = this.docs.get(change.id);
    if (change.data === null) {
      if (this.drop(change.id)) this.emit();
      return;
    }
    if (doc) {
      doc.receive({ rev: change.rev, data: change.data });
    } else {
      this.add({ rev: change.rev, data: change.data });
      this.emit();
    }
  }

  /** Riallinea con il server (dopo una disconnessione): nuove versioni, nuovi documenti, eliminazioni. */
  async resync(): Promise<void> {
    const list = await this.opts.api.list();
    const onServer = new Set(list.map((v) => v.data.id));
    for (const v of list) this.receive({ id: v.data.id, rev: v.rev, data: v.data });
    let changed = false;
    for (const [id, doc] of this.docs) {
      // version 0 = creazione ancora in corso: non è un'eliminazione
      if (!onServer.has(id) && doc.version > 0) changed = this.drop(id) || changed;
    }
    if (changed) this.emit();
  }

  flushAll(): Promise<void> {
    return Promise.all([...this.docs.values()].map((d) => d.flush())).then(() => undefined);
  }

  private add(initial: Versioned<T>, ready?: Promise<number>) {
    const id = initial.data.id;
    const doc: DocSync<T> = new DocSync<T>(initial, {
      save: (data, rev) => this.opts.api.update(data, rev),
      onChange: () => this.emit(),
      onGone: () => {
        if (this.drop(id)) this.emit();
      },
      onError: this.opts.onError,
      delayMs: this.opts.delayMs,
      retryMs: this.opts.retryMs,
      canSave: this.opts.canSave,
      isPermanent: this.opts.isPermanent,
      ready,
    });
    this.docs.set(id, doc);
    if (!this.order.includes(id)) this.order.push(id);
  }

  private emit() {
    this.opts.onChange(this.list);
  }

  private drop(id: string): boolean {
    const doc = this.docs.get(id);
    if (!doc) return false;
    doc.dispose();
    this.docs.delete(id);
    this.order = this.order.filter((x) => x !== id);
    return true;
  }
}
