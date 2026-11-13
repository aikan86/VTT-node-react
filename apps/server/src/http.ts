import type { FastifyReply } from "fastify";
import type { z } from "zod";

/** Valida il body: in caso di errore risponde 400 e restituisce undefined. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown, reply: FastifyReply): z.infer<S> | undefined {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  void reply.code(400).send({ error: "Dati non validi", issues: result.error.issues });
  return undefined;
}

export function notFound(reply: FastifyReply, what: string) {
  return reply.code(404).send({ error: `${what} non trovato` });
}
