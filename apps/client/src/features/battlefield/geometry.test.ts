import { describe, expect, it } from "vitest";
import { BackgroundSchema, GridSchema, SceneSchema, newScene } from "@vtt/shared";
import { appendPoint, appendVertex, backgroundBounds, backgroundFromNode, calibrateBackground, cellLengthIn, cellPointsToPx, closesTrace, contentBounds, gridLines, pxPointsToCells, snapAngle, translatePoints } from "./geometry";

const bg = (patch = {}) => BackgroundSchema.parse({ imageUrl: "/uploads/a.png", widthPx: 200, heightPx: 100, ...patch });

describe("background schema", () => {
  it("defaults position and rotation for scenes saved before they existed", () => {
    expect(bg()).toMatchObject({ x: 0, y: 0, rotation: 0 });
  });
});

describe("backgroundBounds", () => {
  it("is the image rectangle when not rotated", () => {
    expect(backgroundBounds(bg({ x: 10, y: 20 }))).toEqual({ minX: 10, minY: 20, maxX: 210, maxY: 120 });
  });

  it("rotates around the center", () => {
    const b = backgroundBounds(bg({ rotation: 90 }));
    // centro (100, 50): ruotata di 90° diventa 100 × 200
    expect(b.minX).toBeCloseTo(50);
    expect(b.maxX).toBeCloseTo(150);
    expect(b.minY).toBeCloseTo(-50);
    expect(b.maxY).toBeCloseTo(150);
  });
});

describe("backgroundFromNode", () => {
  it("converts a dragged node (positioned by its center) back to the top-left corner", () => {
    expect(backgroundFromNode(bg(), { x: 300, y: 250, scaleX: 1, scaleY: 1, rotation: 0 })).toMatchObject({ x: 200, y: 200, widthPx: 200, heightPx: 100 });
  });

  it("applies scale and rotation from the transformer, keeping the center", () => {
    const next = backgroundFromNode(bg(), { x: 100, y: 50, scaleX: 2, scaleY: 2, rotation: 45.4 });
    expect(next).toMatchObject({ widthPx: 400, heightPx: 200, x: -100, y: -50, rotation: 45 });
  });

  it("normalizes the rotation to 0..359", () => {
    expect(backgroundFromNode(bg(), { x: 100, y: 50, scaleX: 1, scaleY: 1, rotation: -90 }).rotation).toBe(270);
  });
});

describe("grid without edges", () => {
  it("accepts scenes saved with rows/columns and new scenes without them", () => {
    const old = { ...newScene().grid, cols: 30, rows: 20 };
    expect(GridSchema.parse(old)).toMatchObject({ cellPx: 50 });
    const { cols: _c, rows: _r, offsetX: _x, offsetY: _y, ...minimal } = old;
    expect(GridSchema.parse(minimal)).toMatchObject({ offsetX: 0, offsetY: 0 });
  });

  it("draws lines only over the visible area, in world coordinates", () => {
    const grid = { ...newScene().grid, cellPx: 50 };
    expect(gridLines(grid, { x: 0, y: 0, scale: 1 }, { width: 100, height: 60 })).toEqual({ xs: [0, 50, 100], ys: [0, 50] });
    // vista spostata a destra/basso: si vedono coordinate negative
    expect(gridLines(grid, { x: 120, y: 0, scale: 1 }, { width: 100, height: 40 })).toEqual({ xs: [-150, -100, -50], ys: [0] });
    // zoom 2x: metà dell'area del mondo
    expect(gridLines(grid, { x: 0, y: 0, scale: 2 }, { width: 200, height: 100 })).toEqual({ xs: [0, 50, 100], ys: [0, 50] });
  });

  it("skips the grid when cells would be too small to see", () => {
    expect(gridLines({ ...newScene().grid, cellPx: 20 }, { x: 0, y: 0, scale: 0.1 }, { width: 1000, height: 800 })).toBeNull();
  });
});

describe("contentBounds", () => {
  it("defaults to a 30×20 area when the scene is empty", () => {
    expect(contentBounds(newScene())).toEqual({ minX: 0, minY: 0, maxX: 1500, maxY: 1000 });
  });

  it("covers background, tokens (with size), elements and effects, also at negative coordinates", () => {
    const scene = {
      ...newScene(),
      background: bg({ x: 100, y: 100 }),
      tokens: [{ id: "t", ref: { kind: "pc" as const, id: "p" }, x: -4, y: 2 }],
      elements: [{ id: "e", type: "wall" as const, x: 10, y: -3, w: 2, h: 1, rotation: 0, color: "#000000" }],
      effects: [{ id: "f", shape: "circle" as const, x: 20, y: 10, sizeFt: 10, rotation: 0, color: "#ff0000", opacity: 0.4 }],
    };
    expect(contentBounds(scene, () => 2)).toEqual({ minX: -200, minY: -150, maxX: 1100, maxY: 600 });
  });

  it("covers hand-traced sight blockers", () => {
    const scene = { ...newScene(), sightBlockers: [{ id: "b", points: [40, 2, 44, 2, 42, 35] }] };
    expect(contentBounds(scene)).toEqual({ minX: 2000, minY: 100, maxX: 2200, maxY: 1750 });
  });
});

describe("drawings", () => {
  it("are empty for scenes saved before they existed", () => {
    const { drawings: _d, ...old } = newScene();
    expect(SceneSchema.parse(old).drawings).toEqual([]);
  });

  it("validate text, straight lines and freehand strokes", () => {
    const scene = {
      ...newScene(),
      drawings: [
        { id: "t", kind: "text", x: 1.5, y: 2, text: "Trappola", fontSize: 24, rotation: 0, color: "#ffffff" },
        { id: "l", kind: "line", points: [0, 0, 3, 4], strokeWidth: 3, color: "#ff0000" },
        { id: "f", kind: "freehand", points: [0, 0, 1, 1, 2, 0], strokeWidth: 3, color: "#00ff00" },
      ],
    };
    expect(SceneSchema.parse(scene).drawings).toHaveLength(3);
    const odd = { ...scene, drawings: [{ id: "f", kind: "freehand", points: [0, 0, 1, 1, 2], strokeWidth: 3, color: "#00ff00" }] };
    expect(SceneSchema.safeParse(odd).success).toBe(false);
  });
});

describe("drawing geometry", () => {
  const grid = { cellPx: 50, offsetX: 10, offsetY: 20 };

  it("converts flat point lists between world pixels and cells", () => {
    expect(pxPointsToCells([10, 20, 110, 45], grid)).toEqual([0, 0, 2, 0.5]);
    expect(cellPointsToPx([0, 0, 2, 0.5], grid)).toEqual([10, 20, 110, 45]);
  });

  it("translates every point", () => {
    expect(translatePoints([0, 0, 1, 2], 0.5, -1)).toEqual([0.5, -1, 1.5, 1]);
  });

  it("snaps a segment to the nearest multiple of 45° keeping its length", () => {
    const end = snapAngle({ x: 0, y: 0 }, { x: 10, y: 1 });
    expect(end.x).toBeCloseTo(Math.hypot(10, 1));
    expect(end.y).toBeCloseTo(0);
    const diag = snapAngle({ x: 5, y: 5 }, { x: 15, y: 14 });
    expect(diag.x - 5).toBeCloseTo(diag.y - 5);
    expect(Math.hypot(diag.x - 5, diag.y - 5)).toBeCloseTo(Math.hypot(10, 9));
  });

  it("adds a freehand point only when far enough from the last one", () => {
    const points = [0, 0];
    expect(appendPoint(points, { x: 1, y: 1 }, 3)).toBe(points);
    expect(appendPoint(points, { x: 3, y: 0 }, 3)).toEqual([0, 0, 3, 0]);
  });

  it("includes drawings in the content area", () => {
    const scene = {
      ...newScene(),
      drawings: [
        { id: "l", kind: "line" as const, points: [-2, 0, 40, 1] as [number, number, number, number], strokeWidth: 3, color: "#ff0000" },
        { id: "t", kind: "text" as const, x: 0, y: 25, text: "Qui", fontSize: 50, rotation: 0, color: "#ffffff" },
      ],
    };
    const b = contentBounds(scene);
    expect(b.minX).toBe(-100);
    expect(b.maxX).toBe(2000);
    expect(b.maxY).toBeGreaterThanOrEqual(1300);
  });
});

describe("calibrateBackground", () => {
  const grid = { cellPx: 50, offsetX: 0, offsetY: 0 };

  it("leaves the image unchanged when the distance already matches the grid", () => {
    // 100 px sull'immagine = 2 caselle = 100 px di griglia
    expect(calibrateBackground(bg(), { x: 0, y: 0 }, { x: 100, y: 0 }, 2, grid)).toMatchObject({ x: 0, y: 0, widthPx: 200, heightPx: 100 });
  });

  it("scales the image around the first point, which stays where it was clicked", () => {
    // 50 px sull'immagine = 2 caselle: serve scala 2, con p1 fermo in (10, 10)
    const next = calibrateBackground(bg(), { x: 10, y: 10 }, { x: 10, y: 60 }, 2, grid)!;
    expect(next).toMatchObject({ widthPx: 400, heightPx: 200, x: -10, y: -10 });
    // p1 era a (10, 10) dall'angolo dell'immagine, ora a (20, 20) dal nuovo angolo (-10, -10) → ancora (10, 10)
    expect(next.x + 20).toBeCloseTo(10);
  });

  it("keeps the rotation and the image source", () => {
    const next = calibrateBackground(bg({ rotation: 90 }), { x: 0, y: 0 }, { x: 50, y: 0 }, 1, grid)!;
    expect(next.rotation).toBe(90);
    expect(next.imageUrl).toBe("/uploads/a.png");
  });

  it("can snap the first point to the nearest grid intersection", () => {
    const next = calibrateBackground(bg(), { x: 10, y: 10 }, { x: 10, y: 60 }, 2, grid, true)!;
    expect(next).toMatchObject({ widthPx: 400, heightPx: 200, x: -20, y: -20 });
  });

  it("respects the grid offset when snapping", () => {
    const next = calibrateBackground(bg(), { x: 10, y: 10 }, { x: 10, y: 60 }, 2, { cellPx: 50, offsetX: 25, offsetY: 25 }, true)!;
    // linee a 25, 75, ...: l'incrocio più vicino a (10, 10) è (25, 25)
    expect(next.x + 20).toBeCloseTo(25);
    expect(next.y + 20).toBeCloseTo(25);
  });

  it("rejects coincident points, invalid distances and results beyond the limits", () => {
    expect(calibrateBackground(bg(), { x: 5, y: 5 }, { x: 5, y: 5 }, 2, grid)).toBeNull();
    expect(calibrateBackground(bg(), { x: 0, y: 0 }, { x: 50, y: 0 }, 0, grid)).toBeNull();
    expect(calibrateBackground(bg(), { x: 0, y: 0 }, { x: 50, y: 0 }, Number.NaN, grid)).toBeNull();
    expect(calibrateBackground(bg(), { x: 0, y: 0 }, { x: 0.01, y: 0 }, 100, grid)).toBeNull();
  });
});

describe("cellLengthIn", () => {
  it("uses the grid definition (5 ft = 1,5 m)", () => {
    expect(cellLengthIn("cells", 5)).toBe(1);
    expect(cellLengthIn("ft", 5)).toBe(5);
    expect(cellLengthIn("m", 5)).toBeCloseTo(1.5);
    expect(cellLengthIn("m", 10)).toBeCloseTo(3);
  });
});

describe("trace helpers", () => {
  const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];

  it("appends vertices that are far enough from the last one, up to a maximum", () => {
    expect(appendVertex([], { x: 0, y: 0 }, 1, 3)).toEqual([{ x: 0, y: 0 }]);
    const near = [{ x: 0, y: 0 }];
    expect(appendVertex(near, { x: 0.5, y: 0 }, 1, 3)).toBe(near);
    expect(appendVertex(square, { x: 0, y: 100 }, 1, 3)).toBe(square);
  });

  it("closes the shape near the first vertex (in screen pixels) once it has three vertices", () => {
    expect(closesTrace(square, { x: 8, y: 0 }, 1)).toBe(true);
    expect(closesTrace(square, { x: 8, y: 0 }, 2)).toBe(false); // zoom 200%: 8 px del mondo = 16 sullo schermo
    expect(closesTrace(square.slice(0, 2), { x: 0, y: 0 }, 1)).toBe(false);
    expect(closesTrace(square, null, 1)).toBe(false);
  });
});
