import type { z } from "zod";
import type { Versioned } from "@vtt/shared";
import type { Db } from "./db";
import type { ChangeBus } from "./events";

export interface HistoryOptions {
  /** Versioni archiviate da conservare per documento. */
  limit?: number;
  /** Scritture più ravvicinate di così rispetto all'ultima archiviazione non creano una nuova voce (raffiche). */
  coalesceMs?: number;
  now?: () => number;
}

export type PutResult<T> = { ok: true; rev: number } | { ok: false; current: Versioned<T> | null };

export interface HistoryEntry {
  rev: number;
  at: string;
  data: unknown;
  current: boolean;
}

export interface WriteOptions {
  /** Se presente, la scrittura riesce solo se la versione corrente è questa (0 = documento inesistente). */
  expectedRev?: number;
  origin?: string | null;
}

interface Row {
  rev: number;
  data: string;
  updated_at?: string;
}

/**
 * Archivio documentale generico: ogni documento è JSON validato con lo schema condiviso e ha una versione.
 * È l'unico punto di scrittura: archivia la versione precedente e notifica il bus degli eventi.
 */
export class Repo<S extends z.ZodType<{ id: string }>> {
  private readonly limit: number;
  private readonly coalesceMs: number;
  private readonly now: () => number;

  constructor(
    private readonly db: Db,
    readonly collection: string,
    readonly schema: S,
    private readonly bus?: ChangeBus,
    history: HistoryOptions = {},
  ) {
    this.limit = history.limit ?? 200;
    this.coalesceMs = history.coalesceMs ?? 5000;
    this.now = history.now ?? Date.now;
  }

  list(): Versioned<z.infer<S>>[] {
    const rows = this.db
      .prepare("SELECT id, rev, data FROM documents WHERE collection = ? ORDER BY rowid")
      .all(this.collection) as unknown as (Row & { id: string })[];
    return rows.flatMap((row) => {
      const parsed = this.schema.safeParse(JSON.parse(row.data));
      if (parsed.success) return [{ rev: row.rev, data: parsed.data }];
      console.warn(`[repo] documento non valido ignorato: ${this.collection}/${row.id}`);
      return [];
    });
  }

  get(id: string): Versioned<z.infer<S>> | undefined {
    const row = this.row(id);
    return row ? { rev: row.rev, data: this.schema.parse(JSON.parse(row.data)) } : undefined;
  }

  has(id: string): boolean {
    return this.row(id) !== undefined;
  }

  put(doc: z.infer<S>, opts: WriteOptions = {}): PutResult<z.infer<S>> {
    const row = this.row(doc.id);
    if (opts.expectedRev !== undefined && (row?.rev ?? 0) !== opts.expectedRev) {
      return { ok: false, current: row ? { rev: row.rev, data: this.schema.parse(JSON.parse(row.data)) } : null };
    }
    const rev = Math.max(row?.rev ?? 0, this.maxArchivedRev(doc.id)) + 1;
    this.db.exec("BEGIN");
    try {
      if (row) this.archive(doc.id, row, false);
      this.db
        .prepare(
          `INSERT INTO documents (collection, id, data, updated_at, rev) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, rev = excluded.rev`,
        )
        .run(this.collection, doc.id, JSON.stringify(doc), new Date(this.now()).toISOString(), rev);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    this.bus?.emit({ collection: this.collection, id: doc.id, rev, data: doc, origin: opts.origin ?? null });
    return { ok: true, rev };
  }

  delete(id: string, origin: string | null = null): boolean {
    const row = this.row(id);
    if (!row) return false;
    this.db.exec("BEGIN");
    try {
      this.archive(id, row, true);
      this.db.prepare("DELETE FROM documents WHERE collection = ? AND id = ?").run(this.collection, id);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    this.bus?.emit({ collection: this.collection, id, rev: row.rev + 1, data: null, origin });
    return true;
  }

  /** Versione corrente + archiviate, dalla più recente (`at` = quando quella versione è stata salvata). */
  history(id: string): HistoryEntry[] {
    const row = this.row(id);
    const archived = this.db
      .prepare("SELECT rev, data, archived_at, saved_at FROM document_history WHERE collection = ? AND id = ? ORDER BY rev DESC")
      .all(this.collection, id) as { rev: number; data: string; archived_at: number; saved_at: string | null }[];
    const entries: HistoryEntry[] = archived.map((h) => ({
      rev: h.rev,
      at: h.saved_at ?? new Date(h.archived_at).toISOString(),
      data: JSON.parse(h.data),
      current: false,
    }));
    if (row) entries.unshift({ rev: row.rev, at: row.updated_at ?? "", data: JSON.parse(row.data), current: true });
    return entries;
  }

  /** Ripristina una versione (corrente o archiviata) come nuova revisione. */
  restore(id: string, rev: number, origin: string | null = null): Versioned<z.infer<S>> | undefined {
    const entry = this.history(id).find((h) => h.rev === rev);
    if (!entry) return undefined;
    const doc = this.schema.parse(entry.data);
    const result = this.put(doc, { origin });
    if (!result.ok) return undefined;
    return { rev: result.rev, data: doc };
  }

  private row(id: string): Row | undefined {
    return this.db
      .prepare("SELECT rev, data, updated_at FROM documents WHERE collection = ? AND id = ?")
      .get(this.collection, id) as Row | undefined;
  }

  private maxArchivedRev(id: string): number {
    const r = this.db
      .prepare("SELECT MAX(rev) AS rev FROM document_history WHERE collection = ? AND id = ?")
      .get(this.collection, id) as { rev: number | null };
    return r.rev ?? 0;
  }

  /** Archivia la versione che sta per essere sostituita (o eliminata). */
  private archive(id: string, row: Row, force: boolean) {
    const now = this.now();
    if (!force && this.coalesceMs > 0) {
      const last = this.db
        .prepare("SELECT MAX(archived_at) AS at FROM document_history WHERE collection = ? AND id = ?")
        .get(this.collection, id) as { at: number | null };
      if (last.at !== null && now - last.at < this.coalesceMs) return;
    }
    this.db
      .prepare(
        "INSERT OR REPLACE INTO document_history (collection, id, rev, data, archived_at, saved_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(this.collection, id, row.rev, row.data, now, row.updated_at ?? null);
    this.db
      .prepare(
        `DELETE FROM document_history WHERE collection = ? AND id = ? AND rev NOT IN (
           SELECT rev FROM document_history WHERE collection = ? AND id = ? ORDER BY rev DESC LIMIT ?)`,
      )
      .run(this.collection, id, this.collection, id, this.limit);
  }
}
