import { describe, expect, it } from "vitest";
import {
  duplicateSaved,
  instantiateScene,
  LoadSceneRequestSchema,
  SavedSceneSchema,
  SceneSchema,
  sceneCenter,
  snapshotScene,
  summarizeSaved,
} from "../src";
import type { Npc } from "../src/schemas/combat";
import { newScene, type Scene } from "../src/schemas/scene";

const npc = (id: string, size = 1): Npc => ({ id, name: `Goblin ${id}`, color: "#16a34a", hp: { current: 5, max: 5, temp: 0 }, ac: 15, initiativeMod: 1, size, conditions: [] });

function preparedScene(): Scene {
  return {
    ...newScene("Taverna del Cinghiale"),
    background: { imageUrl: "/uploads/taverna.jpg", widthPx: 1000, heightPx: 600, x: 0, y: 0, rotation: 0 },
    grid: { ...newScene().grid, cellPx: 50, feetPerCell: 5 },
    elements: [{ id: "w1", type: "wall", x: 0, y: 0, w: 20, h: 1, rotation: 0, color: "#4b5563" }],
    lights: [{ id: "l1", x: 3.5, y: 3.5, brightFt: 20, dimFt: 20, color: "#fbbf24" }],
    objects: [{ id: "o1", kind: "table", x: 5, y: 5, w: 2, h: 1, rotation: 0, color: "#8a5a2b", blocksSight: false }],
    sightBlockers: [{ id: "b1", points: [15, 2, 18, 2, 18, 5] }],
    vision: { enabled: true, radiusFt: 60, darkness: 0.8 },
    dark: true,
    explored: ["1,1", "2,2"],
    shownToPlayers: true,
    tokens: [
      { id: "t-pc", ref: { kind: "pc", id: "aria" }, x: 4, y: 4 },
      { id: "t-g1", ref: { kind: "npc", id: "g1" }, x: 8, y: 6, hidden: true },
      { id: "t-g2", ref: { kind: "npc", id: "g2" }, x: 9, y: 6 },
      { id: "t-orphan", ref: { kind: "npc", id: "sparito" }, x: 1, y: 1 },
    ],
  };
}

const NOW = new Date("2026-11-18T10:00:00.000Z");

describe("snapshotScene", () => {
  const saved = snapshotScene(preparedScene(), [npc("g1"), npc("g2", 2), npc("altro")], "  Taverna del Cinghiale ", "lib-1", NOW);

  it("keeps everything the master prepared", () => {
    expect(SavedSceneSchema.parse(saved)).toEqual(saved);
    expect(saved).toMatchObject({ id: "lib-1", name: "Taverna del Cinghiale", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
    const s = saved.scene;
    expect(s.background?.imageUrl).toBe("/uploads/taverna.jpg");
    expect(s.grid.cellPx).toBe(50);
    expect(s.elements.map((e) => e.id)).toEqual(["w1"]);
    expect(s.lights.map((l) => l.id)).toEqual(["l1"]);
    expect(s.objects.map((o) => o.id)).toEqual(["o1"]);
    expect(s.sightBlockers.map((b) => b.id)).toEqual(["b1"]);
    expect(s.vision).toEqual({ enabled: true, radiusFt: 60, darkness: 0.8 });
    expect(s.dark).toBe(true);
  });

  it("keeps the placed NPCs with their stats, and nothing else of the party or combat", () => {
    expect(saved.scene.tokens.map((t) => t.id)).toEqual(["t-g1", "t-g2"]);
    expect(saved.scene.tokens[0]!.hidden).toBe(true);
    expect(saved.npcs.map((n) => n.id)).toEqual(["g1", "g2"]); // non "altro": non è sulla mappa
  });

  it("leaves out the explored fog, the on-air state and the scene identity", () => {
    expect(saved.scene).not.toHaveProperty("explored");
    expect(saved.scene).not.toHaveProperty("shownToPlayers");
    expect(saved.scene).not.toHaveProperty("id");
    expect(saved.scene).not.toHaveProperty("name");
    expect(JSON.stringify(saved)).not.toContain("handout");
  });

  it("summarizes with the background as thumbnail", () => {
    expect(summarizeSaved(saved)).toEqual({ id: "lib-1", name: "Taverna del Cinghiale", createdAt: saved.createdAt, updatedAt: saved.updatedAt, thumbnailUrl: "/uploads/taverna.jpg", npcCount: 2 });
    const bare = snapshotScene(newScene("Vuota"), [], "Vuota", "lib-2", NOW);
    expect(summarizeSaved(bare).thumbnailUrl).toBeNull();
  });
});

describe("duplicateSaved", () => {
  it("copies the content, pointing to the same image files", () => {
    const saved = snapshotScene(preparedScene(), [npc("g1"), npc("g2")], "Taverna", "lib-1", NOW);
    const later = new Date("2026-11-19T08:00:00.000Z");
    const copy = duplicateSaved(saved, "lib-2", undefined, later);
    expect(copy).toMatchObject({ id: "lib-2", name: "Taverna (copia)", createdAt: later.toISOString() });
    expect(copy.scene).toEqual(saved.scene);
    expect(copy.scene.background?.imageUrl).toBe(saved.scene.background?.imageUrl);
    expect(duplicateSaved(saved, "lib-3", "Taverna di notte").name).toBe("Taverna di notte");
  });
});

describe("instantiateScene", () => {
  let n = 0;
  const ids = () => `new-${++n}`;

  it("creates a fresh scene with new ids, no fog and not on air", () => {
    const saved = snapshotScene(preparedScene(), [npc("g1"), npc("g2")], "Taverna", "lib-1", NOW);
    const { scene, npcs } = instantiateScene(saved, [], ids);
    expect(SceneSchema.parse(scene)).toEqual(scene);
    expect(scene.id).toMatch(/^new-/);
    expect(scene.name).toBe("Taverna");
    expect(scene.explored).toEqual([]);
    expect(scene.shownToPlayers).toBe(false);
    expect(npcs.map((x) => x.name)).toEqual(["Goblin g1", "Goblin g2"]);
    expect(npcs.every((x) => x.id.startsWith("new-"))).toBe(true);
    // i token puntano ai PNG nuovi e mantengono posizione e "nascosto"
    expect(scene.tokens.map((t) => [t.ref.id, t.x, t.y, t.hidden])).toEqual([
      [npcs[0]!.id, 8, 6, true],
      [npcs[1]!.id, 9, 6, undefined],
    ]);
    expect(scene.tokens.some((t) => t.ref.kind === "pc")).toBe(false);
  });

  it("places the PCs at the scene's starting point, around the NPCs", () => {
    const saved = snapshotScene({ ...preparedScene(), pcStart: { x: 8, y: 6 } }, [npc("g1"), npc("g2")], "Taverna", "lib-1", NOW);
    const { scene } = instantiateScene(saved, [{ ref: { kind: "pc", id: "aria" }, size: 1 }, { ref: { kind: "pc", id: "borin" }, size: 1 }], ids);
    const pcs = scene.tokens.filter((t) => t.ref.kind === "pc");
    expect(pcs.map((t) => t.ref.id)).toEqual(["aria", "borin"]);
    const taken = new Set(scene.tokens.filter((t) => t.ref.kind === "npc").map((t) => `${t.x},${t.y}`));
    for (const t of pcs) {
      expect(taken.has(`${t.x},${t.y}`)).toBe(false);
      expect(Math.max(Math.abs(t.x - 8), Math.abs(t.y - 6))).toBeLessThanOrEqual(1);
    }
    expect(new Set(pcs.map((t) => `${t.x},${t.y}`)).size).toBe(2);
  });

  it("without a starting point uses the middle of the map, avoiding walls", () => {
    // sfondo 1000×600 px, celle da 50: centro nella cella (10, 6); un muro la copre
    const base = preparedScene();
    const walled: Scene = { ...base, tokens: [], elements: [{ id: "w", type: "wall", x: 9, y: 5, w: 3, h: 3, rotation: 0, color: "#4b5563" }] };
    expect(sceneCenter(walled)).toEqual({ x: 10, y: 6 });
    const saved = snapshotScene(walled, [], "Taverna", "lib-1", NOW);
    const [pc] = instantiateScene(saved, [{ ref: { kind: "pc", id: "aria" }, size: 1 }], ids).scene.tokens;
    expect(pc).toBeDefined();
    const insideWall = pc!.x >= 9 && pc!.x < 12 && pc!.y >= 5 && pc!.y < 8;
    expect(insideWall).toBe(false);
    expect(Math.max(Math.abs(pc!.x - 10), Math.abs(pc!.y - 6))).toBe(2);
  });

  it("centers on the elements when there is no background, and on (0, 0) in an empty scene", () => {
    const s = { ...newScene(), elements: [{ id: "a", type: "wall" as const, x: 10, y: 10, w: 10, h: 4, rotation: 0, color: "#4b5563" }] };
    expect(sceneCenter(s)).toEqual({ x: 15, y: 12 });
    expect(sceneCenter(newScene())).toEqual({ x: 0, y: 0 });
  });

  it("can be loaded twice without clashing ids", () => {
    const saved = snapshotScene(preparedScene(), [npc("g1"), npc("g2")], "Taverna", "lib-1", NOW);
    const a = instantiateScene(saved, [], ids);
    const b = instantiateScene(saved, [], ids);
    expect(a.scene.id).not.toBe(b.scene.id);
    expect(a.npcs.map((x) => x.id)).not.toEqual(b.npcs.map((x) => x.id));
  });
});

describe("request schemas", () => {
  it("only bring PCs along", () => {
    expect(LoadSceneRequestSchema.safeParse({ pcs: [{ ref: { kind: "npc", id: "g" }, size: 1 }] }).success).toBe(false);
    expect(LoadSceneRequestSchema.parse({})).toEqual({ pcs: [] });
  });

  it("old scenes without a starting point are still valid", () => {
    const { pcStart: _pcStart, ...old } = newScene();
    expect(SceneSchema.parse(old).pcStart).toBeUndefined();
  });
});
