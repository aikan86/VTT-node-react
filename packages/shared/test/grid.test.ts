import { describe, expect, it } from "vitest";
import { cellToPx, feetToCells, feetToPx, pxToCell, snapPxToCell } from "../src/grid";

const grid = { cellPx: 50, offsetX: 10, offsetY: 20, feetPerCell: 5 };

describe("grid helpers", () => {
  it("converts a cell to its top-left pixel", () => {
    expect(cellToPx({ x: 0, y: 0 }, grid)).toEqual({ x: 10, y: 20 });
    expect(cellToPx({ x: 3, y: 2 }, grid)).toEqual({ x: 160, y: 120 });
  });

  it("converts pixels to the containing cell (floor)", () => {
    expect(pxToCell({ x: 10, y: 20 }, grid)).toEqual({ x: 0, y: 0 });
    expect(pxToCell({ x: 59, y: 69 }, grid)).toEqual({ x: 0, y: 0 });
    expect(pxToCell({ x: 60, y: 70 }, grid)).toEqual({ x: 1, y: 1 });
    expect(pxToCell({ x: 0, y: 0 }, grid)).toEqual({ x: -1, y: -1 });
  });

  it("snaps a dragged top-left pixel to the nearest cell (round)", () => {
    expect(snapPxToCell({ x: 34, y: 20 }, grid)).toEqual({ x: 0, y: 0 });
    expect(snapPxToCell({ x: 36, y: 46 }, grid)).toEqual({ x: 1, y: 1 });
    expect(snapPxToCell({ x: 161, y: 118 }, grid)).toEqual({ x: 3, y: 2 });
  });

  it("converts feet to cells and pixels", () => {
    expect(feetToCells(15, grid)).toBe(3);
    expect(feetToCells(20, grid)).toBe(4);
    expect(feetToPx(15, grid)).toBe(150);
  });
});
