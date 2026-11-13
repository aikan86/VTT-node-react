import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import { CLIENT_ID_HEADER } from "@vtt/shared";

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

/**
 * Versione su cui il client ha basato la modifica (header If-Match), obbligatoria: una scrittura senza versione
 * (es. un tab rimasto aperto con una versione vecchia dell'app) potrebbe sovrascrivere dati più recenti.
 * `null` = header mancante o non valido (già risposto 428/400).
 */
export function expectedRev(req: FastifyRequest, reply: FastifyReply): number | null {
  const header = req.headers["if-match"];
  if (header === undefined) {
    void reply.code(428).send({ error: "Versione del documento mancante: ricarica la pagina (app aggiornata)" });
    return null;
  }
  const rev = Number(String(header).replaceAll('"', ""));
  if (Number.isInteger(rev) && rev >= 0) return rev;
  void reply.code(400).send({ error: "Header If-Match non valido" });
  return null;
}

export function originOf(req: FastifyRequest): string | null {
  const value = req.headers[CLIENT_ID_HEADER];
  return typeof value === "string" && value ? value.slice(0, 100) : null;
}

export const CONFLICT_MESSAGE = "Il documento è stato modificato altrove: ricarica e riprova";
