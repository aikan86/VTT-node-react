import { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

/** Versione dello schema registrata in `PRAGMA user_version` (0 = database creato prima delle migrazioni numerate). */
export const SCHEMA_VERSION = 1;

/** Migrazioni numerate: la n-esima porta lo schema dalla versione n alla n + 1. Si applicano una volta sola, in ordine. */
const MIGRATIONS: ((db: Db) => void)[] = [
  // 0 → 1: libreria di scene riutilizzabili (le scene attive restano nella tabella `documents`)
  (db) =>
    db.exec(`
      CREATE TABLE IF NOT EXISTS saved_scenes (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        data       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `),
];

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
  // colonne aggiunte prima delle migrazioni numerate (controllate una per una)
  const columns = db.prepare("PRAGMA table_info(documents)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "rev")) db.exec("ALTER TABLE documents ADD COLUMN rev INTEGER NOT NULL DEFAULT 1");
  const historyColumns = db.prepare("PRAGMA table_info(document_history)").all() as { name: string }[];
  if (!historyColumns.some((c) => c.name === "saved_at")) db.exec("ALTER TABLE document_history ADD COLUMN saved_at TEXT");

  const { user_version: from } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let version = from; version < MIGRATIONS.length; version++) {
    db.exec("BEGIN");
    try {
      MIGRATIONS[version]!(db);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  return db;
}
