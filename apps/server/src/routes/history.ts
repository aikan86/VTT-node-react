import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db";
import type { Versioned } from "@vtt/shared";
import type { HistoryEntry } from "../repo";
import { notFound, originOf, parseBody } from "../http";

/** Ciò che serve alla cronologia di una collezione (implementato da Repo). */
export interface HistorySource {
  readonly collection: string;
  history(id: string): HistoryEntry[];
  restore(id: string, rev: number, origin: string | null): Versioned<unknown> | undefined;
}

const RestoreBody = z.object({ rev: z.number().int().min(1) });

/** Etichetta leggibile per un documento (nome, o round per il combattimento). */
function labelOf(data: unknown): string {
  if (data && typeof data === "object") {
    const d = data as { name?: unknown; round?: unknown; value?: unknown };
    if (typeof d.name === "string") return d.name;
    if (typeof d.round === "number") return `Round ${d.round}`;
    if (typeof d.value === "number") return `d20: ${d.value}`;
  }
  return "";
}

/** Cronologia delle versioni e ripristino (anche di documenti eliminati). */
export function registerHistoryRoutes(app: FastifyInstance, db: Db, repos: HistorySource[]) {
  const byCollection = new Map(repos.map((r) => [r.collection, r]));

  app.get("/api/history", async () => {
    const rows = db
      .prepare(
        `SELECT collection, id, COUNT(*) AS versions, MAX(archived_at) AS last FROM document_history GROUP BY collection, id
         UNION ALL
         SELECT collection, id, 0, NULL FROM documents
         WHERE NOT EXISTS (SELECT 1 FROM document_history h WHERE h.collection = documents.collection AND h.id = documents.id)`,
      )
      .all() as { collection: string; id: string; versions: number; last: number | null }[];
    return rows.flatMap((row) => {
      const repo = byCollection.get(row.collection);
      if (!repo) return [];
      const history = repo.history(row.id);
      const latest = history[0];
      return [
        {
          collection: row.collection,
          id: row.id,
          label: labelOf(latest?.data),
          versions: history.length,
          deleted: !latest?.current,
          lastChange: latest?.at ?? null,
        },
      ];
    });
  });

  app.get<{ Params: { collection: string; id: string } }>("/api/history/:collection/:id", async (req, reply) => {
    const repo = byCollection.get(req.params.collection);
    if (!repo) return notFound(reply, "Collezione");
    const history = repo.history(req.params.id);
    return history.length ? history : notFound(reply, "Documento");
  });

  app.post<{ Params: { collection: string; id: string } }>("/api/history/:collection/:id/restore", async (req, reply) => {
    const repo = byCollection.get(req.params.collection);
    if (!repo) return notFound(reply, "Collezione");
    const body = parseBody(RestoreBody, req.body, reply);
    if (!body) return reply;
    const restored = repo.restore(req.params.id, body.rev, originOf(req));
    if (!restored) return notFound(reply, "Versione");
    if (req.params.collection === "combat") {
      const { id: _id, ...data } = restored.data as { id: string };
      return { rev: restored.rev, data };
    }
    return restored;
  });
}
