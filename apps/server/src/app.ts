import { mkdirSync } from "node:fs";
import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { COLLECTIONS, CharacterSchema, DmRollSchema, SceneSchema } from "@vtt/shared";
import { openDb } from "./db";
import { ChangeBus } from "./events";
import { Repo, type HistoryOptions } from "./repo";
import { registerDocumentRoutes } from "./routes/documents";
import { registerCombatRoutes, StoredCombatSchema } from "./routes/combat";
import { registerEventRoutes } from "./routes/events";
import { registerHistoryRoutes } from "./routes/history";
import { registerUploadRoutes } from "./routes/uploads";

export interface AppOptions {
  dbPath: string;
  uploadsDir: string;
  /** Se presente, serve il client compilato (modalità produzione). */
  clientDist?: string;
  logger?: boolean;
  /** Conservazione della cronologia delle versioni (default: 200 versioni, raffiche di 5 s accorpate). */
  history?: HistoryOptions;
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  mkdirSync(opts.uploadsDir, { recursive: true });
  const db = openDb(opts.dbPath);
  const app = Fastify({ logger: opts.logger ?? true, bodyLimit: 10 * 1024 * 1024 });
  app.addHook("onClose", async () => db.close());

  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  await app.register(fastifyStatic, { root: opts.uploadsDir, prefix: "/uploads/", immutable: true, maxAge: "365d" });

  const bus = new ChangeBus();
  const characters = new Repo(db, COLLECTIONS.characters, CharacterSchema, bus, opts.history);
  const scenes = new Repo(db, COLLECTIONS.scenes, SceneSchema, bus, opts.history);
  const dmRolls = new Repo(db, COLLECTIONS.dmRolls, DmRollSchema, bus, opts.history);
  const combat = new Repo(db, COLLECTIONS.combat, StoredCombatSchema, bus, opts.history);

  registerDocumentRoutes(app, { path: "/api/characters", label: "Personaggio", repo: characters });
  registerDocumentRoutes(app, { path: "/api/scenes", label: "Scena", repo: scenes });
  registerDocumentRoutes(app, { path: "/api/dm-rolls", label: "Tiro", repo: dmRolls });
  registerCombatRoutes(app, combat);
  registerEventRoutes(app, bus);
  registerHistoryRoutes(app, db, [characters, scenes, dmRolls, combat]);
  registerUploadRoutes(app, opts.uploadsDir);

  if (opts.clientDist) {
    // L'HTML va sempre riconvalidato (punta agli asset della release corrente); gli asset hanno l'hash nel nome.
    await app.register(fastifyStatic, {
      root: opts.clientDist,
      prefix: "/",
      decorateReply: false,
      wildcard: false,
      cacheControl: false,
      setHeaders: (res, path) => {
        res.header("cache-control", path.endsWith(".html") ? "no-cache" : "public, max-age=31536000, immutable");
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api/")) {
        return reply.header("cache-control", "no-cache").sendFile("index.html", opts.clientDist!, { cacheControl: false });
      }
      return reply.code(404).send({ error: "Non trovato" });
    });
  }

  return app;
}
