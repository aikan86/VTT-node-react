import { describe, expect, it } from "vitest";
import { newScene, SceneSchema, type Light, type Scene } from "../src/schemas/scene";
import { isDarkScene, lightArea, lightAreas, NO_SIGHT, partySight, partyViewers, pointSeen, seenCells, withoutUnseenTokens } from "../src/sight";
import { pointInPolygon, sightSegments } from "../src/visibility";

/** Celle da 10 px e 5 ft: 1 ft = 2 px. */
function scene(extra: Partial<Scene> = {}): Scene {
  const s = newScene();
  return { ...s, grid: { ...s.grid, cellPx: 10, offsetX: 0, offsetY: 0, feetPerCell: 5 }, vision: { enabled: true, radiusFt: 0, darkness: 0.7 }, ...extra };
}

const pc = (x: number, y: number, darkvisionFt?: number) => ({ id: `pc-${x}-${y}`, ref: { kind: "pc" as const, id: "aria" }, x, y, ...(darkvisionFt ? { darkvisionFt } : {}) });
const light = (x: number, y: number, brightFt: number, dimFt: number): Light => ({ id: `l-${x}-${y}`, x, y, brightFt, dimFt, color: "#ffcc00" });
const size = () => 1;
/** Muro verticale nelle celle x = 20, y da -10 a 9 (da 200 a 210 px). */
const wall = { id: "w", type: "wall" as const, x: 20, y: -10, w: 1, h: 20, rotation: 0, color: "#000000" };

describe("partyViewers", () => {
  it("uses the centre of each player character with its darkvision, ignoring NPCs and unknown characters", () => {
    const s = scene();
    s.grid.offsetX = 5;
    s.tokens = [
      { id: "a", ref: { kind: "pc", id: "big" }, x: 1, y: 1, darkvisionFt: 60 },
      { id: "b", ref: { kind: "npc", id: "gob" }, x: 3, y: 3 },
      { id: "c", ref: { kind: "pc", id: "missing" }, x: 5, y: 5 },
    ];
    const sizes: Record<string, number> = { big: 2, gob: 1 };
    expect(partyViewers(s, (ref) => sizes[ref.id])).toEqual([{ origin: { x: 5 + 10 + 10, y: 10 + 10 }, darkvisionFt: 60 }]);
  });
});

describe("lightArea", () => {
  it("converts the radii from feet and centres on the light", () => {
    const a = lightArea(light(2, 3, 10, 5), [], scene().grid);
    expect(a.center).toEqual({ x: 20, y: 30 });
    expect(a.brightPx).toBe(20);
    expect(a.outerPx).toBe(30);
    expect(pointInPolygon({ x: 20 + 25, y: 30 }, a.outer)).toBe(true);
    expect(pointInPolygon({ x: 20 + 25, y: 30 }, a.bright!)).toBe(false);
  });

  it("has no bright area when it only gives dim light", () => {
    expect(lightArea(light(0, 0, 0, 10), [], scene().grid).bright).toBeNull();
  });

  it("is stopped by walls", () => {
    const s = scene({ elements: [wall] });
    const a = lightArea(light(15, 0, 100, 0), sightSegments(s), s.grid);
    expect(pointInPolygon({ x: 180, y: 0 }, a.outer)).toBe(true);
    expect(pointInPolygon({ x: 260, y: 0 }, a.outer)).toBe(false); // oltre il muro
  });

  it("skips lights that reach nothing", () => {
    expect(lightAreas(scene({ lights: [light(0, 0, 0, 0), light(1, 1, 5, 0)] }))).toHaveLength(1);
  });
});

describe("partySight", () => {
  it("is empty without vision or without player characters", () => {
    expect(partySight(scene({ vision: { enabled: false, radiusFt: 0, darkness: 1 }, tokens: [pc(0, 0)] }), size)).toBe(NO_SIGHT);
    expect(partySight(scene(), size)).toBe(NO_SIGHT);
  });

  it("in a normal scene sees everything in line of sight", () => {
    const sight = partySight(scene({ tokens: [pc(0, 0)], elements: [wall] }), size);
    expect(sight.dark).toBeNull();
    expect(pointSeen({ x: 150, y: 5 }, sight)).toBe(true);
    expect(pointSeen({ x: 300, y: 5 }, sight)).toBe(false); // dietro il muro
  });

  it("in a dark scene sees nothing without lights or darkvision", () => {
    const sight = partySight(scene({ dark: true, tokens: [pc(0, 0)] }), size);
    expect(sight.dark).toEqual({ bright: [], lit: [], darkvision: [] });
    expect(pointSeen({ x: 5, y: 5 }, sight)).toBe(false);
  });

  it("in a dark scene sees inside lights that are in line of sight", () => {
    // luce a (100, 5) con 10 ft pieni + 10 ft di penombra: raggio 40 px
    const sight = partySight(scene({ dark: true, tokens: [pc(0, 0)], lights: [light(10, 0.5, 10, 10)] }), size);
    expect(pointSeen({ x: 100, y: 5 }, sight)).toBe(true);
    expect(pointSeen({ x: 135, y: 5 }, sight)).toBe(true); // in penombra
    expect(pointSeen({ x: 150, y: 5 }, sight)).toBe(false); // fuori dalla luce
    expect(pointSeen({ x: 50, y: 5 }, sight)).toBe(false); // al buio tra il PG e la luce
    expect(sight.dark!.bright).toHaveLength(1);
  });

  it("does not see a light behind a wall, even though the light itself reaches the near side", () => {
    // PG a sinistra del muro, luce a destra: illumina solo il suo lato
    const sight = partySight(scene({ dark: true, elements: [wall], tokens: [pc(0, 0)], lights: [light(25, 0.5, 30, 0)] }), size);
    expect(pointSeen({ x: 250, y: 5 }, sight)).toBe(false);
  });

  it("sees within darkvision without light, limited by walls and by the vision radius", () => {
    const s = scene({ dark: true, elements: [wall], tokens: [pc(18, 0, 60)] }); // 60 ft = 120 px, centro (185, 5)
    const sight = partySight(s, size);
    expect(pointSeen({ x: 100, y: 5 }, sight)).toBe(true);
    expect(pointSeen({ x: 50, y: 5 }, sight)).toBe(false); // oltre la scurovisione
    expect(pointSeen({ x: 250, y: 5 }, sight)).toBe(false); // dietro il muro
    const limited = partySight({ ...s, vision: { ...s.vision, radiusFt: 20 } }, size); // 40 px
    expect(pointSeen({ x: 100, y: 5 }, limited)).toBe(false);
  });

  it("ignores lights in a normal scene", () => {
    expect(partySight(scene({ tokens: [pc(0, 0)], lights: [light(1, 1, 5, 5)] }), size).dark).toBeNull();
  });
});

describe("isDarkScene", () => {
  it("needs both the dark flag and vision", () => {
    expect(isDarkScene(scene({ dark: true }))).toBe(true);
    expect(isDarkScene(scene({ dark: false }))).toBe(false);
    expect(isDarkScene({ dark: true, vision: { enabled: false, radiusFt: 0, darkness: 1 } })).toBe(false);
  });
});

describe("seenCells", () => {
  const limit = { minX: -500, minY: -500, maxX: 500, maxY: 500 };

  it("in the dark remembers only lit cells in sight and cells in darkvision", () => {
    const s = scene({ dark: true, tokens: [pc(0, 0, 5)], lights: [light(10.5, 0.5, 5, 0)] }); // luce: 10 px attorno a (105, 5)
    const cells = seenCells(partySight(s, size), s.grid, limit);
    expect(cells).toContain("0,0"); // scurovisione
    expect(cells).toContain("10,0"); // illuminata
    expect(cells).not.toContain("5,0"); // al buio
    expect(cells).toHaveLength(new Set(cells).size);
  });

  it("in a normal scene remembers everything in line of sight", () => {
    const s = scene({ tokens: [pc(0, 0)] });
    expect(seenCells(partySight(s, size), s.grid, { minX: 0, minY: 0, maxX: 30, maxY: 10 })).toHaveLength(3);
  });
});

describe("withoutUnseenTokens", () => {
  const npc = (id: string, x: number, y: number) => ({ id, ref: { kind: "npc" as const, id }, x, y });

  it("keeps player characters and NPCs in sight, drops the others", () => {
    const s = scene({ elements: [wall], tokens: [pc(0, 0), npc("near", 5, 0), npc("behind", 30, 0)] });
    const shown = withoutUnseenTokens(s, partySight(s, size), size);
    expect(shown.tokens.map((t) => t.id)).toEqual(["pc-0-0", "near"]);
  });

  it("hides NPCs standing in the dark, shows them in the light", () => {
    const s = scene({ dark: true, tokens: [pc(0, 0), npc("dark", 5, 0), npc("lit", 10, 0)], lights: [light(10.5, 0.5, 5, 0)] });
    expect(withoutUnseenTokens(s, partySight(s, size), size).tokens.map((t) => t.id)).toEqual(["pc-0-0", "lit"]);
  });

  it("does nothing when the party sees nothing to compare with", () => {
    const s = scene({ tokens: [npc("gob", 1, 1)] });
    expect(withoutUnseenTokens(s, NO_SIGHT, size)).toBe(s);
  });
});

describe("scene schema: lights and darkness", () => {
  it("defaults to no lights, not dark, for scenes saved before", () => {
    const { lights, dark, ...old } = newScene();
    expect(lights).toEqual([]);
    expect(dark).toBe(false);
    const parsed = SceneSchema.parse(old);
    expect(parsed.lights).toEqual([]);
    expect(parsed.dark).toBe(false);
  });

  it("validates lights and token darkvision", () => {
    const s = newScene();
    expect(SceneSchema.safeParse({ ...s, lights: [light(1, 1, 20, 20)] }).success).toBe(true);
    expect(SceneSchema.safeParse({ ...s, lights: [light(1, 1, -5, 20)] }).success).toBe(false);
    expect(SceneSchema.safeParse({ ...s, lights: [{ ...light(1, 1, 20, 20), color: "giallo" }] }).success).toBe(false);
    expect(SceneSchema.safeParse({ ...s, tokens: [pc(0, 0, 60)] }).success).toBe(true);
    expect(SceneSchema.safeParse({ ...s, tokens: [{ ...pc(0, 0), darkvisionFt: -10 }] }).success).toBe(false);
  });
});

describe("viewers and lights inside a shape that blocks the view", () => {
  /** Porta chiusa nella cella (0, 0) e muro più in là (x = 20). */
  const door = { id: "d", type: "door" as const, x: 0, y: 0, w: 1, h: 1, rotation: 0, color: "#000000" };

  it("a PC standing in a closed doorway sees around it, still not through other walls", () => {
    const sight = partySight(scene({ tokens: [pc(0, 0)], elements: [door, wall] }), size);
    const [los] = sight.los;
    expect(pointInPolygon({ x: 100, y: 5 }, los!)).toBe(true); // oltre la porta
    expect(pointInPolygon({ x: 5, y: -100 }, los!)).toBe(true);
    expect(pointInPolygon({ x: 300, y: 5 }, los!)).toBe(false); // dietro al muro
  });

  it("a PC centred on the edge of a wall is not blinded", () => {
    // centro del PG (205, 5): sul bordo tra le celle 20 e 21, cioè dentro il muro largo 1
    const edge = { ...wall, x: 20.5 };
    const sight = partySight(scene({ tokens: [pc(20, 0)], elements: [edge] }), size);
    expect(pointInPolygon({ x: 150, y: 5 }, sight.los[0]!)).toBe(true);
  });

  it("a light inside an obstacle lights its surroundings", () => {
    const pillar = { id: "p", type: "obstacle" as const, x: 0, y: 0, w: 1, h: 1, rotation: 0, color: "#000000" };
    const [area] = lightAreas(scene({ elements: [pillar], lights: [light(0.5, 0.5, 20, 0)] }));
    expect(pointInPolygon({ x: 30, y: 5 }, area!.bright!)).toBe(true);
  });

  it("darkvision from a doorway is not blocked by the door itself", () => {
    const sight = partySight(scene({ dark: true, tokens: [pc(0, 0, 60)], elements: [door] }), size);
    expect(pointSeen({ x: 60, y: 5 }, sight)).toBe(true);
  });
});

describe("partySight performance", () => {
  it("stays fast in a dark scene with many obstacles, lights and PCs with darkvision", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32), seed / 2 ** 32);
    const s = scene({ dark: true });
    s.grid = { ...s.grid, cellPx: 50 };
    s.elements = Array.from({ length: 150 }, (_, i) => ({ id: `o${i}`, type: "obstacle" as const, x: Math.floor(rnd() * 80 - 40), y: Math.floor(rnd() * 80 - 40), w: 1, h: 1, rotation: 0, color: "#000000" }));
    s.lights = Array.from({ length: 10 }, () => light(rnd() * 40 - 20, rnd() * 40 - 20, 20, 20));
    s.tokens = Array.from({ length: 6 }, (_, i) => pc(i * 2 + 0.3, 0.3, 60));
    // per ogni calcolo: 6 linee di vista + 6 scurovisioni + 2 poligoni per luce = 32 visibilityPolygon
    const start = performance.now();
    for (let k = 0; k < 5; k++) partySight(s, size);
    expect(performance.now() - start).toBeLessThan(400);
  });
});
