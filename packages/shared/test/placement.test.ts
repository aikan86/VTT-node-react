import { describe, expect, it } from "vitest";
import { findFreeCells } from "../src/placement";

const bounds = { cols: 5, rows: 4 };

describe("findFreeCells", () => {
  it("returns the start cell when free", () => {
    expect(findFreeCells([], [1], { x: 2, y: 1 }, bounds)).toEqual([{ x: 2, y: 1 }]);
  });

  it("skips cells covered by existing tokens, including large ones", () => {
    const occupied = [{ x: 0, y: 0, size: 2 }];
    expect(findFreeCells(occupied, [1, 1], { x: 0, y: 0 }, bounds)).toEqual([
      { x: 2, y: 0 },
      { x: 0, y: 2 },
    ]);
  });

  it("does not overlap the tokens it is placing", () => {
    expect(findFreeCells([], [1, 1, 1], { x: 1, y: 1 }, bounds)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ]);
  });

  it("keeps large tokens fully inside the grid", () => {
    expect(findFreeCells([], [2], { x: 4, y: 3 }, bounds)).toEqual([{ x: 3, y: 2 }]);
  });

  it("returns fewer cells when the grid is full", () => {
    const occupied = [{ x: 0, y: 0, size: 4 }, { x: 4, y: 0, size: 1 }, { x: 4, y: 1, size: 1 }, { x: 4, y: 2, size: 1 }];
    expect(findFreeCells(occupied, [1, 1], { x: 0, y: 0 }, bounds)).toEqual([{ x: 4, y: 3 }]);
  });
});
