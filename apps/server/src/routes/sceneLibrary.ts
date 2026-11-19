import type { FastifyInstance } from "fastify";
import {
  createId,
  duplicateSaved,
  DuplicateSceneRequestSchema,
  instantiateScene,
  LoadSceneRequestSchema,
  RenameSceneRequestSchema,
  SaveSceneRequestSchema,
  snapshotScene,
  summarizeSaved,
} from "@vtt/shared";
import { notFound, originOf, parseBody } from "../http";
import type { SavedSceneStore } from "../savedScenes";

const LABEL = "Scena salvata";

/**
 * Libreria di scene: elenco (riepiloghi), salvataggio della scena corrente, caricamento come nuova scena,
 * duplicazione (le immagini restano gli stessi file in `uploads/`), rinomina ed eliminazione.
 */
export function registerSceneLibraryRoutes(app: FastifyInstance, store: SavedSceneStore, now: () => Date = () => new Date()) {
  const base = "/api/scene-library";

  app.get(base, async () => store.list().map(summarizeSaved));

  app.get<{ Params: { id: string } }>(`${base}/:id`, async (req, reply) => store.get(req.params.id) ?? notFound(reply, LABEL));

  app.post(base, async (req, reply) => {
    const body = parseBody(SaveSceneRequestSchema, req.body, reply);
    if (!body) return reply;
    const saved = snapshotScene(body.scene, body.npcs, body.name, createId(), now());
    return reply.code(201).send(store.put(saved, originOf(req)));
  });

  /** Non scrive nulla: restituisce la nuova scena e i suoi PNG, che il client crea con la normale sincronizzazione. */
  app.post<{ Params: { id: string } }>(`${base}/:id/load`, async (req, reply) => {
    const saved = store.get(req.params.id);
    if (!saved) return notFound(reply, LABEL);
    const body = parseBody(LoadSceneRequestSchema, req.body ?? {}, reply);
    if (!body) return reply;
    return instantiateScene(saved, body.pcs, createId);
  });

  app.post<{ Params: { id: string } }>(`${base}/:id/duplicate`, async (req, reply) => {
    const saved = store.get(req.params.id);
    if (!saved) return notFound(reply, LABEL);
    const body = parseBody(DuplicateSceneRequestSchema, req.body ?? {}, reply);
    if (!body) return reply;
    return reply.code(201).send(store.put(duplicateSaved(saved, createId(), body.name, now()), originOf(req)));
  });

  app.patch<{ Params: { id: string } }>(`${base}/:id`, async (req, reply) => {
    const body = parseBody(RenameSceneRequestSchema, req.body, reply);
    if (!body) return reply;
    return store.rename(req.params.id, body.name, originOf(req)) ?? notFound(reply, LABEL);
  });

  app.delete<{ Params: { id: string } }>(`${base}/:id`, async (req, reply) =>
    store.delete(req.params.id, originOf(req)) ? reply.code(204).send() : notFound(reply, LABEL),
  );
}
