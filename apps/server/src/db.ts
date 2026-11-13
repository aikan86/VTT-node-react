import { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

/** Apre il database e applica lo schema e le migrazioni (idempotente). */
export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS documents (
      collection TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE TABLE IF NOT EXISTS document_history (
      collection  TEXT NOT NULL,
      id          TEXT NOT NULL,
      rev         INTEGER NOT NULL,
      data        TEXT NOT NULL,
      archived_at INTEGER NOT NULL,
      saved_at    TEXT,
      PRIMARY KEY (collection, id, rev)
    );
  `);
  // v2: versione ottimistica per documento (i documenti esistenti partono da 1)
  const columns = db.prepare("PRAGMA table_info(documents)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "rev")) db.exec("ALTER TABLE documents ADD COLUMN rev INTEGER NOT NULL DEFAULT 1");
  const historyColumns = db.prepare("PRAGMA table_info(document_history)").all() as { name: string }[];
  if (!historyColumns.some((c) => c.name === "saved_at")) db.exec("ALTER TABLE document_history ADD COLUMN saved_at TEXT");
  return db;
}
