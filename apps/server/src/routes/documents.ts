import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import type { Repo } from "../repo";
import { CONFLICT_MESSAGE, expectedRev, notFound, originOf, parseBody } from "../http";

/** CRUD REST per una collezione di documenti versionati: le risposte sono `{ rev, data }`. */
export function registerDocumentRoutes<S extends z.ZodType<{ id: string }>>(
  app: FastifyInstance,
  opts: { path: string; label: string; repo: Repo<S> },
) {
  const { path, label, repo } = opts;

  app.get(path, async () => repo.list());

  app.get<{ Params: { id: string } }>(`${path}/:id`, async (req, reply) => {
    return repo.get(req.params.id) ?? notFound(reply, label);
  });

  app.post(path, async (req, reply) => {
    const doc = parseBody(repo.schema, req.body, reply);
    if (!doc) return reply;
    const result = repo.put(doc, { expectedRev: 0, origin: originOf(req) });
    if (!result.ok) return reply.code(409).send({ error: `${label} già esistente`, current: result.current });
    return reply.code(201).send({ rev: result.rev, data: doc });
  });

  app.put<{ Params: { id: string } }>(`${path}/:id`, async (req, reply) => {
    const rev = expectedRev(req, reply);
    if (rev === null) return reply;
    const doc = parseBody(repo.schema, req.body, reply);
    if (!doc) return reply;
    if (doc.id !== req.params.id) return reply.code(400).send({ error: "L'id nel body non corrisponde all'URL" });
    if (!repo.has(doc.id)) return notFound(reply, label);
    const result = repo.put(doc, { expectedRev: rev, origin: originOf(req) });
    if (!result.ok) return reply.code(409).send({ error: CONFLICT_MESSAGE, current: result.current });
    return { rev: result.rev, data: doc };
  });

  app.delete<{ Params: { id: string } }>(`${path}/:id`, async (req, reply) => {
    return repo.delete(req.params.id, originOf(req)) ? reply.code(204).send() : notFound(reply, label);
  });
}
