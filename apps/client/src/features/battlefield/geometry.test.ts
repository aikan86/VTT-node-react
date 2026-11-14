import { describe, expect, it } from "vitest";
import { BackgroundSchema, GridSchema, newScene } from "@vtt/shared";
import { backgroundBounds, backgroundFromNode, contentBounds, gridLines } from "./geometry";

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
});
