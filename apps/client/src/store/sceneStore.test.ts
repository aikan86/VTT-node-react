import { describe, expect, it } from "vitest";
import { emptyCombat, newScene, type Npc, type Scene } from "@vtt/shared";
import { uniqueSceneName } from "./sceneLibraryStore";
import { pruneSceneNpcs } from "./sceneStore";

const npc = (id: string): Npc => ({ id, name: id, color: "#16a34a", hp: { current: 5, max: 5, temp: 0 }, ac: 15, initiativeMod: 1, size: 1, conditions: [] });
const withNpcs = (name: string, ...ids: string[]): Scene => ({
  ...newScene(name),
  tokens: ids.map((id, i) => ({ id: `t-${id}`, ref: { kind: "npc" as const, id }, x: i, y: 0 })),
});

describe("pruneSceneNpcs", () => {
  it("drops the deleted scene's NPCs unless another scene or the initiative still uses them", () => {
    const combat = {
      ...emptyCombat(),
      npcs: ["solo", "shared", "fighting", "unplaced"].map(npc),
      combatants: [{ id: "c1", ref: { kind: "npc" as const, id: "fighting" }, roll: 10, acted: false, order: 0, notes: "" }],
    };
    const next = pruneSceneNpcs(combat, ["solo", "shared", "fighting"], [withNpcs("Altra", "shared")]);
    expect(next.npcs.map((n) => n.id)).toEqual(["shared", "fighting", "unplaced"]);
    expect(next.combatants).toBe(combat.combatants);
  });

  it("returns the same object when nothing goes", () => {
    const combat = { ...emptyCombat(), npcs: [npc("a")] };
    expect(pruneSceneNpcs(combat, ["a"], [withNpcs("Altra", "a")])).toBe(combat);
  });
});

describe("uniqueSceneName", () => {
  it("adds (2), (3)… ignoring case, within 80 characters", () => {
    expect(uniqueSceneName("Cripta", ["Strada"])).toBe("Cripta");
    expect(uniqueSceneName("Cripta", ["cripta", "Cripta (2)"])).toBe("Cripta (3)");
    const long = "x".repeat(80);
    expect(uniqueSceneName(long, [long])).toBe("x".repeat(76) + " (2)");
  });
});
