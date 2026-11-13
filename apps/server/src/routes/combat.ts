import type { FastifyInstance } from "fastify";
import { COMBAT_DOC_ID, CombatSchema, IdSchema, emptyCombat, type Combat, type Versioned } from "@vtt/shared";
import type { Repo } from "../repo";
import { CONFLICT_MESSAGE, expectedRev, originOf, parseBody } from "../http";

export const StoredCombatSchema = CombatSchema.extend({ id: IdSchema });
export type CombatRepo = Repo<typeof StoredCombatSchema>;

function toCombat(stored: Versioned<Combat & { id: string }> | null | undefined): Versioned<Combat> {
  if (!stored) return { rev: 0, data: emptyCombat() };
  const { id: _id, ...data } = stored.data;
  return { rev: stored.rev, data };
}

/** Il combattimento è un documento singleton (versione 0 = mai salvato). */
export function registerCombatRoutes(app: FastifyInstance, repo: CombatRepo) {
  app.get("/api/combat", async () => toCombat(repo.get(COMBAT_DOC_ID)));

  app.put("/api/combat", async (req, reply) => {
    const rev = expectedRev(req, reply);
    if (rev === null) return reply;
    const combat = parseBody(CombatSchema, req.body, reply);
    if (!combat) return reply;
    const result = repo.put({ ...combat, id: COMBAT_DOC_ID }, { expectedRev: rev, origin: originOf(req) });
    if (!result.ok) return reply.code(409).send({ error: CONFLICT_MESSAGE, current: toCombat(result.current) });
    return { rev: result.rev, data: combat };
  });
}
