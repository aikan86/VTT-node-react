import { describe, expect, it } from "vitest";
import { BackgroundSchema, newScene } from "@vtt/shared";
import { backgroundBounds, backgroundFromNode, worldSize } from "./geometry";

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

describe("worldSize", () => {
  it("covers a moved background image", () => {
    const scene = { ...newScene(), background: bg({ x: 2000, y: 1500 }) };
    expect(worldSize(scene)).toEqual({ width: 2200, height: 1600 });
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
