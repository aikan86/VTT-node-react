import type { z } from "zod";
import type { Db } from "./db";

/**
 * Archivio documentale generico: ogni documento è JSON validato con lo schema condiviso.
 * È l'unico punto di scrittura: un futuro broadcast WebSocket andrà agganciato qui.
 */
export class Repo<S extends z.ZodType<{ id: string }>> {
  constructor(
    private readonly db: Db,
    private readonly collection: string,
    private readonly schema: S,
  ) {}

  list(): z.infer<S>[] {
    const rows = this.db
      .prepare("SELECT id, data FROM documents WHERE collection = ? ORDER BY rowid")
      .all(this.collection) as { id: string; data: string }[];
    return rows.flatMap((row) => {
      const parsed = this.schema.safeParse(JSON.parse(row.data));
      if (parsed.success) return [parsed.data];
      console.warn(`[repo] documento non valido ignorato: ${this.collection}/${row.id}`);
      return [];
    });
  }

  get(id: string): z.infer<S> | undefined {
    const row = this.db
      .prepare("SELECT data FROM documents WHERE collection = ? AND id = ?")
      .get(this.collection, id) as { data: string } | undefined;
    return row ? this.schema.parse(JSON.parse(row.data)) : undefined;
  }

  has(id: string): boolean {
    return this.db.prepare("SELECT 1 FROM documents WHERE collection = ? AND id = ?").get(this.collection, id) !== undefined;
  }

  put(doc: z.infer<S>): z.infer<S> {
    this.db
      .prepare(
        `INSERT INTO documents (collection, id, data, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(this.collection, doc.id, JSON.stringify(doc), new Date().toISOString());
    return doc;
  }

  delete(id: string): boolean {
    const result = this.db.prepare("DELETE FROM documents WHERE collection = ? AND id = ?").run(this.collection, id);
    return Number(result.changes) > 0;
  }
}
