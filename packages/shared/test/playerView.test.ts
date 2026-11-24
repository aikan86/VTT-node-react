import { describe, expect, it } from "vitest";
import { playerCombatants, playerCurrentRef, playerScene } from "../src/playerView";
import { ELEMENT_COLORS, newScene, SceneSchema, withElementType } from "../src/schemas/scene";
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

  it("returns the same scene when revealed traps carry nothing master-only", () => {
    const scene = { ...newScene(), elements: [trap("found", { revealed: true, label: "Fossa" })] };
    expect(playerScene(scene)).toBe(scene);
  });

  it("drops fields that belong to another element type when parsing", () => {
    const wall = { id: "w", type: "wall" as const, x: 0, y: 0, w: 1, h: 1, rotation: 0, color: "#4b5563" };
    const parsed = SceneSchema.parse({ ...newScene(), elements: [{ ...wall, dc: 12, notes: "segreto", revealed: true, open: true }, trap("t", { open: true, dc: 12 })] });
    expect(parsed.elements).toEqual([wall, trap("t", { dc: 12 })]);
  });
});

describe("withElementType", () => {
  it("keeps the fields the new type shares and drops the old type's own", () => {
    const door = { id: "d", type: "door" as const, x: 1, y: 2, w: 1, h: 1, rotation: 90, color: "#92400e", label: "Cripta", open: true };
    expect(withElementType(door, "trap")).toEqual({ id: "d", type: "trap", x: 1, y: 2, w: 1, h: 1, rotation: 90, color: ELEMENT_COLORS.trap, label: "Cripta" });
    expect(withElementType(door, "door")).toEqual({ ...door, color: ELEMENT_COLORS.door });
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

describe("playerCurrentRef", () => {
  const shown = { showInitiative: true };

  it("tells whose turn it is only for a combatant with a visible token", () => {
    const { scene, combat } = setup();
    expect(playerCurrentRef({ ...combat, currentId: "c2" }, scene, shown)).toEqual(goblin);
    expect(playerCurrentRef({ ...combat, currentId: "c3" }, scene, shown)).toBeNull(); // l'orco è nascosto
    expect(playerCurrentRef({ ...combat, currentId: "c4" }, scene, shown)).toBeNull(); // non è sulla mappa
  });

  it("tells nothing when the master hides the initiative, outside combat or without a scene", () => {
    const { scene, combat } = setup();
    expect(playerCurrentRef({ ...combat, currentId: "c2" }, scene, { showInitiative: false })).toBeNull();
    expect(playerCurrentRef({ ...combat, active: false, currentId: "c2" }, scene, shown)).toBeNull();
    expect(playerCurrentRef({ ...combat, currentId: "c2" }, undefined, shown)).toBeNull();
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
