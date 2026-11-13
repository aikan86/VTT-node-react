import { mkdirSync } from "node:fs";
import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { CharacterSchema, SceneSchema } from "@vtt/shared";
import { openDb } from "./db";
import { Repo } from "./repo";
import { registerDocumentRoutes } from "./routes/documents";
import { registerCombatRoutes } from "./routes/combat";
import { registerUploadRoutes } from "./routes/uploads";

export interface AppOptions {
  dbPath: string;
  uploadsDir: string;
  /** Se presente, serve il client compilato (modalità produzione). */
  clientDist?: string;
  logger?: boolean;
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  mkdirSync(opts.uploadsDir, { recursive: true });
  const db = openDb(opts.dbPath);
  const app = Fastify({ logger: opts.logger ?? true, bodyLimit: 10 * 1024 * 1024 });
  app.addHook("onClose", async () => db.close());

  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  await app.register(fastifyStatic, { root: opts.uploadsDir, prefix: "/uploads/", immutable: true, maxAge: "365d" });

  registerDocumentRoutes(app, {
    path: "/api/characters",
    label: "Personaggio",
    repo: new Repo(db, "characters", CharacterSchema),
    schema: CharacterSchema,
  });
  registerDocumentRoutes(app, {
    path: "/api/scenes",
    label: "Scena",
    repo: new Repo(db, "scenes", SceneSchema),
    schema: SceneSchema,
  });
  registerCombatRoutes(app, db);
  registerUploadRoutes(app, opts.uploadsDir);

  if (opts.clientDist) {
    await app.register(fastifyStatic, { root: opts.clientDist, prefix: "/", decorateReply: false, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api/")) return reply.sendFile("index.html", opts.clientDist!);
      return reply.code(404).send({ error: "Non trovato" });
    });
  }

  return app;
}
