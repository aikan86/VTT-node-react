import { describe, expect, it } from "vitest";
import { findFreeCells } from "../src/placement";

describe("findFreeCells", () => {
  it("returns the start cell when free", () => {
    expect(findFreeCells([], [1], { x: 2, y: 1 })).toEqual([{ x: 2, y: 1 }]);
  });

  it("skips cells covered by existing tokens, including large ones", () => {
    const occupied = [{ x: 0, y: 0, size: 2 }];
    // (1,1) è coperta dal token 2×2: le più vicine libere sono a destra e sotto
    expect(findFreeCells(occupied, [1, 1], { x: 1, y: 1 })).toEqual([
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ]);
  });

  it("does not overlap the tokens it is placing", () => {
    expect(findFreeCells([], [1, 1, 1], { x: 1, y: 1 })).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ]);
  });

  it("has no grid edges: it can place above or left of the origin", () => {
    const occupied = [
      { x: 0, y: 0, size: 1 },
      { x: 1, y: 0, size: 1 },
      { x: 0, y: 1, size: 1 },
    ];
    expect(findFreeCells(occupied, [1], { x: 0, y: 0 })).toEqual([{ x: 0, y: -1 }]);
  });

  it("returns fewer cells when nothing is free within the search radius", () => {
    expect(findFreeCells([{ x: -1, y: -1, size: 3 }], [1], { x: 0, y: 0 }, 1)).toEqual([]);
  });
});
