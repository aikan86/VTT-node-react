import { describe, expect, it } from "vitest";
import { playerCombatants, playerScene } from "../src/playerView";
import { newScene, SceneSchema } from "../src/schemas/scene";
import { emptyCombat } from "../src/schemas/combat";

const pc = { kind: "pc", id: "pc1" } as const;
const goblin = { kind: "npc", id: "gob" } as const;
const ogre = { kind: "npc", id: "ogre" } as const;

function setup() {
  const scene = newScene();
  scene.tokens = [
    { id: "t1", ref: pc, x: 0, y: 0 },
    { id: "t2", ref: goblin, x: 1, y: 0, hidden: false },
    { id: "t3", ref: ogre, x: 2, y: 0, hidden: true },
  ];
  const combat = {
    ...emptyCombat(),
    active: true,
    combatants: [
      { id: "c1", ref: pc, roll: 10, acted: false, order: 0, notes: "" },
      { id: "c2", ref: goblin, roll: 15, acted: false, order: 1, notes: "" },
      { id: "c3", ref: ogre, roll: 20, acted: false, order: 2, notes: "" },
      { id: "c4", ref: { kind: "npc", id: "assente" } as const, roll: 18, acted: false, order: 3, notes: "" },
    ],
  };
  return { scene, combat };
}

describe("playerScene", () => {
  it("drops the tokens hidden by the master and keeps the rest", () => {
    const { scene } = setup();
    expect(playerScene(scene).tokens.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(playerScene(scene).name).toBe(scene.name);
  });

  it("returns the same scene when nothing is hidden", () => {
    const scene = newScene();
    scene.tokens = [{ id: "t1", ref: pc, x: 0, y: 0 }];
    expect(playerScene(scene)).toBe(scene);
  });
});

describe("playerScene traps", () => {
  const trap = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: "trap" as const, x: 0, y: 0, w: 1, h: 1, rotation: 0, color: "#dc2626", ...extra });

  it("hides traps until they are revealed and strips the master's DC and notes", () => {
    const scene = newScene();
    const wall = { id: "w", type: "wall" as const, x: 0, y: 0, w: 1, h: 1, rotation: 0, color: "#4b5563" };
    scene.elements = [wall, trap("hidden", { dc: 15, notes: "2d10 perforanti" }), trap("found", { revealed: true, dc: 12, notes: "fossa", label: "Fossa" })];
    const shown = playerScene(scene).elements;
    expect(shown.map((el) => el.id)).toEqual(["w", "found"]);
    expect(shown[1]).toEqual(trap("found", { revealed: true, label: "Fossa" }));
    expect(scene.elements).toHaveLength(3);
  });

  it("validates trap fields", () => {
    const scene = { ...newScene(), elements: [trap("t", { dc: 14, notes: "Dardo avvelenato", revealed: false })] };
    expect(SceneSchema.safeParse(scene).success).toBe(true);
    expect(SceneSchema.safeParse({ ...scene, elements: [trap("t", { dc: 99 })] }).success).toBe(false);
  });
});

describe("playerCombatants", () => {
  it("lists only combatants on the map with a visible token, in initiative order", () => {
    const { scene, combat } = setup();
    const list = playerCombatants(combat, scene, () => 0);
    expect(list.map((c) => c.id)).toEqual(["c2", "c1"]); // goblin 15, pg 10; l'orco è nascosto, "assente" non è sulla mappa
  });

  it("keeps an entity visible if at least one of its tokens is visible", () => {
    const { scene, combat } = setup();
    scene.tokens.push({ id: "t4", ref: ogre, x: 3, y: 0 });
    expect(playerCombatants(combat, scene, () => 0).map((c) => c.id)).toEqual(["c3", "c2", "c1"]);
  });
});

describe("scene schema", () => {
  it("is not shown to players by default, also for scenes saved before", () => {
    const { shownToPlayers, ...old } = newScene();
    expect(shownToPlayers).toBe(false);
    expect(SceneSchema.parse(old).shownToPlayers).toBe(false);
  });

  it("accepts tokens without the hidden flag", () => {
    const scene = { ...newScene(), tokens: [{ id: "t", ref: pc, x: 0, y: 0 }] };
    expect(SceneSchema.safeParse(scene).success).toBe(true);
  });
});
