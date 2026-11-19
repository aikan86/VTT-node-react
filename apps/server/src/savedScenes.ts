import { COLLECTIONS, SavedSceneSchema, summarizeSaved, type SavedScene, type SavedSceneSummary } from "@vtt/shared";
import type { Db } from "./db";
import type { ChangeBus } from "./events";

interface Row {
  id: string;
  data: string;
}

/**
 * Libreria di scene salvate (tabella `saved_scenes`). Ogni modifica è notificata sul bus degli eventi
 * con il riepilogo della voce (`data: null` = eliminata), così gli altri tab aggiornano l'elenco.
 */
export class SavedSceneStore {
  constructor(
    private readonly db: Db,
    private readonly bus?: ChangeBus,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Dalla più recente; le voci illeggibili si saltano (con un avviso), come fa il Repo. */
  list(): SavedScene[] {
    const rows = this.db.prepare("SELECT id, data FROM saved_scenes ORDER BY updated_at DESC, name COLLATE NOCASE").all() as unknown as Row[];
    return rows.flatMap((row) => {
      const parsed = SavedSceneSchema.safeParse(JSON.parse(row.data));
      if (parsed.success) return [parsed.data];
      console.warn(`[saved-scenes] scena salvata non valida ignorata: ${row.id}`);
      return [];
    });
  }

  get(id: string): SavedScene | undefined {
    const row = this.db.prepare("SELECT id, data FROM saved_scenes WHERE id = ?").get(id) as Row | undefined;
    return row ? SavedSceneSchema.parse(JSON.parse(row.data)) : undefined;
  }

  /** Inserisce o sostituisce. */
  put(saved: SavedScene, origin: string | null = null): SavedSceneSummary {
    this.db
      .prepare(
        `INSERT INTO saved_scenes (id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(saved.id, saved.name, JSON.stringify(saved), saved.createdAt, saved.updatedAt);
    const summary = summarizeSaved(saved);
    this.notify(saved.id, summary, origin);
    return summary;
  }

  rename(id: string, name: string, origin: string | null = null): SavedSceneSummary | undefined {
    const saved = this.get(id);
    if (!saved) return undefined;
    return this.put({ ...saved, name: name.trim(), updatedAt: this.now().toISOString() }, origin);
  }

  delete(id: string, origin: string | null = null): boolean {
    const { changes } = this.db.prepare("DELETE FROM saved_scenes WHERE id = ?").run(id);
    if (Number(changes) === 0) return false;
    this.notify(id, null, origin);
    return true;
  }

  /** Sostituisce l'intera libreria (importazione di un salvataggio completo). */
  replaceAll(list: SavedScene[], origin: string | null = null): void {
    const keep = new Set(list.map((s) => s.id));
    for (const saved of this.list()) if (!keep.has(saved.id)) this.delete(saved.id, origin);
    for (const saved of list) this.put(saved, origin);
  }

  private notify(id: string, data: SavedSceneSummary | null, origin: string | null) {
    this.bus?.emit({ collection: COLLECTIONS.sceneLibrary, id, rev: this.now().getTime(), data, origin });
  }
}
