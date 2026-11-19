import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import {
  COMBAT_DOC_ID,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  IMAGE_TYPES,
  SETTINGS_DOC_ID,
  StateExportSchema,
  type CharacterSchema,
  type DmRollSchema,
  type HandoutSchema,
  type MonsterSchema,
  type NpcGroupSchema,
  type SceneSchema,
  type StateExport,
} from "@vtt/shared";
import type { Repo } from "../repo";
import { originOf, parseBody } from "../http";
import type { CombatRepo } from "./combat";
import type { SavedSceneStore } from "../savedScenes";
import { toSettings, type SettingsRepo } from "./settings";

/** Un salvataggio completo contiene le immagini in base64: può essere molto più grande di una normale richiesta. */
export const MAX_IMPORT_BYTES = 300 * 1024 * 1024;

export interface TransferRepos {
  characters: Repo<typeof CharacterSchema>;
  scenes: Repo<typeof SceneSchema>;
  dmRolls: Repo<typeof DmRollSchema>;
  combat: CombatRepo;
  handouts: Repo<typeof HandoutSchema>;
  monsters: Repo<typeof MonsterSchema>;
  npcGroups: Repo<typeof NpcGroupSchema>;
  savedScenes: SavedSceneStore;
  settings: SettingsRepo;
}

const UPLOAD_URL = /\/uploads\/([\w-]{1,100}\.(?:png|jpg|webp|gif))/g;
const TYPE_BY_EXT = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([type, ext]) => [ext, type])) as Record<
  string,
  keyof typeof IMAGE_TYPES
>;

const pad = (n: number) => String(n).padStart(2, "0");
const fileStamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;

/** Esportazione e importazione dell'intero stato (documenti + immagini usate) in un unico file JSON. */
export function registerTransferRoutes(app: FastifyInstance, repos: TransferRepos, uploadsDir: string) {
  app.get("/api/export", async (_req, reply) => {
    const stored = repos.combat.get(COMBAT_DOC_ID);
    const docs = {
      characters: repos.characters.list().map((d) => d.data),
      scenes: repos.scenes.list().map((d) => d.data),
      dmRolls: repos.dmRolls.list().map((d) => d.data),
      combat: stored ? withoutId(stored.data) : null,
      handouts: repos.handouts.list().map((d) => d.data),
      monsters: repos.monsters.list().map((d) => d.data),
      npcGroups: repos.npcGroups.list().map((d) => d.data),
      sceneLibrary: repos.savedScenes.list(),
      settings: toSettings(repos.settings.get(SETTINGS_DOC_ID)).data,
    };

    // solo le immagini a cui i documenti fanno riferimento (niente file orfani)
    const uploads: StateExport["uploads"] = {};
    for (const [, name] of JSON.stringify(docs).matchAll(UPLOAD_URL)) {
      const path = join(uploadsDir, name!);
      if (uploads[name!] || !existsSync(path)) continue;
      uploads[name!] = { type: TYPE_BY_EXT[name!.split(".").pop()!]!, data: readFileSync(path).toString("base64") };
    }

    const now = new Date();
    const file: StateExport = { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now.toISOString(), ...docs, uploads };
    return reply.header("content-disposition", `attachment; filename="vtt-${fileStamp(now)}.json"`).send(file);
  });

  app.post("/api/import", { bodyLimit: MAX_IMPORT_BYTES }, async (req, reply) => {
    // tutto il file viene validato prima di scrivere qualsiasi cosa
    const file = parseBody(StateExportSchema, req.body, reply);
    if (!file) return reply;
    const origin = originOf(req);

    for (const [name, upload] of Object.entries(file.uploads)) {
      writeFileSync(join(uploadsDir, name), Buffer.from(upload.data, "base64"));
    }
    replaceAll(repos.characters, file.characters, origin);
    replaceAll(repos.scenes, file.scenes, origin);
    replaceAll(repos.dmRolls, file.dmRolls, origin);
    if (file.combat) repos.combat.put({ ...file.combat, id: COMBAT_DOC_ID }, { origin });
    else repos.combat.delete(COMBAT_DOC_ID, origin);
    // salvataggi di versioni precedenti: senza queste sezioni, si tiene quello che c'è
    if (file.handouts) replaceAll(repos.handouts, file.handouts, origin);
    if (file.monsters) replaceAll(repos.monsters, file.monsters, origin);
    if (file.npcGroups) replaceAll(repos.npcGroups, file.npcGroups, origin);
    if (file.sceneLibrary) repos.savedScenes.replaceAll(file.sceneLibrary, origin);
    if (file.settings) repos.settings.put({ ...file.settings, id: SETTINGS_DOC_ID }, { origin });

    return {
      characters: file.characters.length,
      scenes: file.scenes.length,
      dmRolls: file.dmRolls.length,
      handouts: file.handouts?.length ?? 0,
      monsters: file.monsters?.length ?? 0,
      npcGroups: file.npcGroups?.length ?? 0,
      sceneLibrary: file.sceneLibrary?.length ?? 0,
      uploads: Object.keys(file.uploads).length,
    };
  });
}

/** Rende la collezione identica a `docs`: elimina ciò che manca e salva il resto (le versioni precedenti restano in cronologia). */
function replaceAll<S extends z.ZodType<{ id: string }>>(repo: Repo<S>, docs: z.infer<S>[], origin: string | null) {
  const keep = new Set(docs.map((d) => d.id));
  for (const { data } of repo.list()) if (!keep.has(data.id)) repo.delete(data.id, origin);
  for (const doc of docs) repo.put(doc, { origin });
}

function withoutId<T extends { id: string }>(doc: T): Omit<T, "id"> {
  const { id: _id, ...rest } = doc;
  return rest;
}
