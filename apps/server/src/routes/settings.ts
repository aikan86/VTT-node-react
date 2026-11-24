import type { FastifyInstance } from "fastify";
import { IdSchema, PlayerViewSettingsSchema, SETTINGS_DOC_ID, SettingsSchema, defaultSettings, type Settings, type Versioned } from "@vtt/shared";
import type { Repo } from "../repo";
import { CONFLICT_MESSAGE, expectedRev, originOf, parseBody } from "../http";

export const StoredSettingsSchema = SettingsSchema.extend({ id: IdSchema });
export type SettingsRepo = Repo<typeof StoredSettingsSchema>;

/**
 * Body del PUT: `playerView` può mancare (es. un tab del master aperto con una versione precedente dell'app che
 * cambia solo il logo) e in quel caso resta quello salvato, invece di tornare al default "tutto nascosto".
 */
const SettingsBodySchema = SettingsSchema.extend({ playerView: PlayerViewSettingsSchema.optional() });

export function toSettings(stored: Versioned<Settings & { id: string }> | null | undefined): Versioned<Settings> {
  if (!stored) return { rev: 0, data: defaultSettings() };
  const { id: _id, ...data } = stored.data;
  return { rev: stored.rev, data };
}

/** Le impostazioni generali sono un documento singleton (versione 0 = mai salvato). */
export function registerSettingsRoutes(app: FastifyInstance, repo: SettingsRepo) {
  app.get("/api/settings", async () => toSettings(repo.get(SETTINGS_DOC_ID)));

  app.put("/api/settings", async (req, reply) => {
    const rev = expectedRev(req, reply);
    if (rev === null) return reply;
    const body = parseBody(SettingsBodySchema, req.body, reply);
    if (!body) return reply;
    const settings: Settings = { ...body, playerView: body.playerView ?? toSettings(repo.get(SETTINGS_DOC_ID)).data.playerView };
    const result = repo.put({ ...settings, id: SETTINGS_DOC_ID }, { expectedRev: rev, origin: originOf(req) });
    if (!result.ok) return reply.code(409).send({ error: CONFLICT_MESSAGE, current: toSettings(result.current) });
    return { rev: result.rev, data: settings };
  });
}
