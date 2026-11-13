import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import type { Repo } from "../repo";
import { notFound, parseBody } from "../http";

/** CRUD REST standard per una collezione di documenti con id. */
export function registerDocumentRoutes<S extends z.ZodType<{ id: string }>>(
  app: FastifyInstance,
  opts: { path: string; label: string; repo: Repo<S>; schema: S },
) {
  const { path, label, repo, schema } = opts;

  app.get(path, async () => repo.list());

  app.get<{ Params: { id: string } }>(`${path}/:id`, async (req, reply) => {
    return repo.get(req.params.id) ?? notFound(reply, label);
  });

  app.post(path, async (req, reply) => {
    const doc = parseBody(schema, req.body, reply);
    if (!doc) return reply;
    if (repo.has(doc.id)) return reply.code(409).send({ error: `${label} già esistente` });
    return reply.code(201).send(repo.put(doc));
  });

  app.put<{ Params: { id: string } }>(`${path}/:id`, async (req, reply) => {
    const doc = parseBody(schema, req.body, reply);
    if (!doc) return reply;
    if (doc.id !== req.params.id) return reply.code(400).send({ error: "L'id nel body non corrisponde all'URL" });
    if (!repo.has(doc.id)) return notFound(reply, label);
    return repo.put(doc);
  });

  app.delete<{ Params: { id: string } }>(`${path}/:id`, async (req, reply) => {
    return repo.delete(req.params.id) ? reply.code(204).send() : notFound(reply, label);
  });
}
