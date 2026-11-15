import { describe, expect, it } from "vitest";
import { SceneSchema, newScene } from "../src/schemas/scene";
import { pointInPolygon, sightSegments, visibilityPolygon, visionRadiusPx, type Segment } from "../src/visibility";

const origin = { x: 0, y: 0 };
const wall: Segment = { a: { x: 100, y: -50 }, b: { x: 100, y: 50 } };

describe("visibilityPolygon", () => {
  it("is a disc of the given radius when nothing blocks the view", () => {
    const poly = visibilityPolygon(origin, [], 200);
    for (let i = 0; i < poly.length; i += 2) expect(Math.hypot(poly[i]!, poly[i + 1]!)).toBeCloseTo(200);
    expect(pointInPolygon({ x: 150, y: 0 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 0, y: -190 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 250, y: 0 }, poly)).toBe(false);
  });

  it("is blocked behind a wall but sees around its ends", () => {
    const poly = visibilityPolygon(origin, [wall], 500);
    expect(pointInPolygon({ x: 50, y: 0 }, poly)).toBe(true); // davanti al muro
    expect(pointInPolygon({ x: 200, y: 0 }, poly)).toBe(false); // dietro al muro
    expect(pointInPolygon({ x: 200, y: 20 }, poly)).toBe(false); // ancora nell'ombra
    expect(pointInPolygon({ x: 200, y: 200 }, poly)).toBe(true); // oltre lo spigolo
    expect(pointInPolygon({ x: -200, y: 0 }, poly)).toBe(true); // dall'altra parte
  });

  it("stops at the radius even behind no wall", () => {
    const poly = visibilityPolygon(origin, [wall], 150);
    expect(pointInPolygon({ x: 120, y: 0 }, poly)).toBe(false);
    expect(pointInPolygon({ x: -120, y: 0 }, poly)).toBe(true);
    expect(pointInPolygon({ x: -160, y: 0 }, poly)).toBe(false);
  });

  it("ignores segments that are out of range", () => {
    const far: Segment = { a: { x: 1000, y: -50 }, b: { x: 1000, y: 50 } };
    const poly = visibilityPolygon(origin, [far], 200);
    expect(pointInPolygon({ x: 190, y: 0 }, poly)).toBe(true);
  });

  it("is blocked inside a closed room, with a gap letting the view through", () => {
    // stanza 200×200 con un'apertura di 40 sul lato destro
    const room: Segment[] = [
      { a: { x: -100, y: -100 }, b: { x: 100, y: -100 } },
      { a: { x: 100, y: -100 }, b: { x: 100, y: -20 } },
      { a: { x: 100, y: 20 }, b: { x: 100, y: 100 } },
      { a: { x: 100, y: 100 }, b: { x: -100, y: 100 } },
      { a: { x: -100, y: 100 }, b: { x: -100, y: -100 } },
    ];
    const poly = visibilityPolygon(origin, room, 1000);
    expect(pointInPolygon({ x: 80, y: 80 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 300, y: 0 }, poly)).toBe(true); // attraverso l'apertura
    expect(pointInPolygon({ x: 300, y: 150 }, poly)).toBe(false); // fuori, dietro il muro
    expect(pointInPolygon({ x: -300, y: 0 }, poly)).toBe(false);
  });
});

describe("sightSegments", () => {
  const scene = () => {
    const s = newScene();
    s.grid = { ...s.grid, cellPx: 50, offsetX: 0, offsetY: 0 };
    return s;
  };

  it("uses the sides of walls, doors and obstacles but not difficult terrain", () => {
    const s = scene();
    const base = { rotation: 0, color: "#000000" };
    s.elements = [
      { id: "w", type: "wall", x: 0, y: 0, w: 2, h: 1, ...base },
      { id: "d", type: "door", x: 5, y: 0, w: 1, h: 1, ...base },
      { id: "o", type: "obstacle", x: 8, y: 0, w: 1, h: 1, ...base },
      { id: "t", type: "difficult", x: 10, y: 0, w: 3, h: 3, ...base },
    ];
    expect(sightSegments(s)).toHaveLength(12);
  });

  it("rotates rectangles around their top-left corner", () => {
    const s = scene();
    s.elements = [{ id: "w", type: "wall", x: 2, y: 2, w: 2, h: 1, rotation: 90, color: "#000000" }];
    const corners = sightSegments(s).map((seg) => seg.a);
    expect(corners[0]).toEqual({ x: 100, y: 100 });
    expect(corners[1]!.x).toBeCloseTo(100);
    expect(corners[1]!.y).toBeCloseTo(200); // 2 celle verso il basso
    expect(corners[2]!.x).toBeCloseTo(50); // 1 cella verso sinistra
  });

  it("converts hand-drawn polygons from cells to pixels", () => {
    const s = scene();
    s.grid.offsetX = 10;
    s.sightBlockers = [{ id: "b", points: [0, 0, 2, 0, 2, 2] }];
    const segs = sightSegments(s);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toEqual({ a: { x: 10, y: 0 }, b: { x: 110, y: 0 } });
    expect(segs[2]!.b).toEqual({ x: 10, y: 0 });
  });
});

describe("scene schema", () => {
  it("defaults the vision settings and blockers for scenes saved before they existed", () => {
    const { sightBlockers, vision, ...old } = newScene();
    const parsed = SceneSchema.parse(old);
    expect(parsed.sightBlockers).toEqual([]);
    expect(parsed.vision).toEqual({ enabled: false, radiusFt: 60, darkness: 0.7 });
    expect(sightBlockers).toEqual([]);
    expect(vision.enabled).toBe(false);
  });

  it("requires at least three vertices, in pairs", () => {
    const s = newScene();
    expect(SceneSchema.safeParse({ ...s, sightBlockers: [{ id: "a", points: [0, 0, 1, 1] }] }).success).toBe(false);
    expect(SceneSchema.safeParse({ ...s, sightBlockers: [{ id: "a", points: [0, 0, 1, 1, 2] }] }).success).toBe(false);
    expect(SceneSchema.safeParse({ ...s, sightBlockers: [{ id: "a", points: [0, 0, 1, 0, 1, 1] }] }).success).toBe(true);
  });
});

describe("visionRadiusPx", () => {
  it("converts feet to pixels with the grid, and 0 means unlimited", () => {
    const grid = { feetPerCell: 5, cellPx: 50 };
    expect(visionRadiusPx({ radiusFt: 60 }, grid)).toBe(600);
    expect(visionRadiusPx({ radiusFt: 0 }, grid)).toBeGreaterThan(10_000);
  });
});
