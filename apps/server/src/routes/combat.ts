import type { FastifyInstance } from "fastify";
import { CombatSchema, IdSchema, emptyCombat } from "@vtt/shared";
import type { Db } from "../db";
import { Repo } from "../repo";
import { parseBody } from "../http";

const COMBAT_ID = "current";
const StoredCombatSchema = CombatSchema.extend({ id: IdSchema });

/** Il combattimento è un documento singleton. */
export function registerCombatRoutes(app: FastifyInstance, db: Db) {
  const repo = new Repo(db, "combat", StoredCombatSchema);

  app.get("/api/combat", async () => {
    const stored = repo.get(COMBAT_ID);
    if (!stored) return emptyCombat();
    const { id: _id, ...combat } = stored;
    return combat;
  });

  app.put("/api/combat", async (req, reply) => {
    const combat = parseBody(CombatSchema, req.body, reply);
    if (!combat) return reply;
    repo.put({ ...combat, id: COMBAT_ID });
    return combat;
  });
}
