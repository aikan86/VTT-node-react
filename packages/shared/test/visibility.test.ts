import { describe, expect, it } from "vitest";
import { MAX_SIGHT_BLOCKER_VERTICES, SceneSchema, newScene } from "../src/schemas/scene";
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

  it("is not blinded when the origin lies exactly on a segment", () => {
    const poly = visibilityPolygon({ x: 100, y: 0 }, [wall], 200);
    expect(pointInPolygon({ x: 50, y: 0 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 100, y: -150 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 100, y: 150 }, poly)).toBe(true);
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

describe("visibilityPolygon with many segments", () => {
  // generatore deterministico, per test riproducibili
  const random = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };

  /** Distanza a cui il raggio incontra il primo segmento, controllandoli tutti (riferimento). */
  const bruteReach = (o: { x: number; y: number }, angle: number, segments: Segment[], radius: number) => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let reach = radius;
    for (const s of segments) {
      const sx = s.b.x - s.a.x;
      const sy = s.b.y - s.a.y;
      const denom = dx * sy - dy * sx;
      if (Math.abs(denom) < 1e-12) continue;
      const ax = s.a.x - o.x;
      const ay = s.a.y - o.y;
      const t = (ax * sy - ay * sx) / denom;
      const u = (ax * dy - ay * dx) / denom;
      if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9 && t < reach) reach = t;
    }
    return reach;
  };

  it("matches a brute-force check of every segment on every ray", () => {
    const rnd = random(42);
    for (let scene = 0; scene < 5; scene++) {
      const segments: Segment[] = Array.from({ length: 150 }, () => {
        const a = { x: rnd() * 2000 - 1000, y: rnd() * 2000 - 1000 };
        return { a, b: { x: a.x + rnd() * 200 - 100, y: a.y + rnd() * 200 - 100 } };
      });
      const o = { x: rnd() * 400 - 200, y: rnd() * 400 - 200 };
      for (const radius of [300, 20_000]) {
        const poly = visibilityPolygon(o, segments, radius);
        for (let i = 0; i < poly.length; i += 2) {
          const dx = poly[i]! - o.x;
          const dy = poly[i + 1]! - o.y;
          expect(Math.hypot(dx, dy)).toBeCloseTo(bruteReach(o, Math.atan2(dy, dx), segments, radius), 3);
        }
      }
    }
  });

  it("stays fast with hundreds of segments and unlimited range", () => {
    const rnd = random(7);
    const segments: Segment[] = [];
    for (let i = 0; i < 150; i++) {
      const x = rnd() * 4000 - 2000;
      const y = rnd() * 4000 - 2000;
      const c = [{ x, y }, { x: x + 50, y }, { x: x + 50, y: y + 50 }, { x, y: y + 50 }];
      c.forEach((a, k) => segments.push({ a, b: c[(k + 1) % 4]! }));
    }
    const start = performance.now();
    for (let pc = 0; pc < 4; pc++) visibilityPolygon({ x: pc * 30, y: 0 }, segments, 20_000);
    expect(performance.now() - start).toBeLessThan(500);
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

  it("lets the view through open doors", () => {
    const s = scene();
    s.elements = [{ id: "d", type: "door", x: 0, y: 0, w: 1, h: 1, rotation: 0, color: "#000000", open: true }];
    expect(sightSegments(s)).toHaveLength(0);
  });

  it("skips the shapes that contain the viewer", () => {
    const s = scene();
    const base = { rotation: 0, color: "#000000" };
    s.elements = [
      { id: "d", type: "door", x: 0, y: 0, w: 1, h: 1, ...base },
      { id: "w", type: "wall", x: 3, y: 0, w: 1, h: 1, ...base },
    ];
    expect(sightSegments(s, { x: 25, y: 25 })).toHaveLength(4); // solo il muro
    const poly = visibilityPolygon({ x: 25, y: 25 }, sightSegments(s, { x: 25, y: 25 }), 500);
    expect(pointInPolygon({ x: 25, y: 120 }, poly)).toBe(true); // fuori dalla porta
    expect(pointInPolygon({ x: 300, y: 25 }, poly)).toBe(false); // dietro al muro
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

  it("accepts up to MAX_SIGHT_BLOCKER_VERTICES vertices", () => {
    const s = newScene();
    const polygon = (n: number) => Array.from({ length: n }, (_, i) => [Math.cos(i), Math.sin(i)]).flat();
    expect(SceneSchema.safeParse({ ...s, sightBlockers: [{ id: "a", points: polygon(MAX_SIGHT_BLOCKER_VERTICES) }] }).success).toBe(true);
    expect(SceneSchema.safeParse({ ...s, sightBlockers: [{ id: "a", points: polygon(MAX_SIGHT_BLOCKER_VERTICES + 1) }] }).success).toBe(false);
  });
});

describe("visionRadiusPx", () => {
  it("converts feet to pixels with the grid, and 0 means unlimited", () => {
    const grid = { feetPerCell: 5, cellPx: 50 };
    expect(visionRadiusPx({ radiusFt: 60 }, grid)).toBe(600);
    expect(visionRadiusPx({ radiusFt: 0 }, grid)).toBeGreaterThan(10_000);
  });
});
