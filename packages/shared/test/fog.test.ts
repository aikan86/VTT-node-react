import { describe, expect, it } from "vitest";
import { addExplored, cellKey, cellsInPolygon, exploredRuns, parseCellKey, resetExplored, visibleCells, withoutUnseenTokens } from "../src/fog";
import { MAX_EXPLORED_CELLS, newScene, SceneSchema } from "../src/schemas/scene";
import { visibilityPolygon } from "../src/visibility";

const grid = { cellPx: 10, offsetX: 0, offsetY: 0 };
const big = { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };
/** Quadrato [0,30]×[0,20] in pixel: 3×2 celle. */
const rect = [0, 0, 30, 0, 30, 20, 0, 20];

const sorted = (cells: string[]) => [...cells].sort();

describe("cell keys", () => {
  it("round-trips, negatives included", () => {
    expect(cellKey(-3, 7)).toBe("-3,7");
    expect(parseCellKey("-3,7")).toEqual({ x: -3, y: 7 });
  });
});

describe("cellsInPolygon", () => {
  it("returns the cells whose centre is inside", () => {
    expect(sorted(cellsInPolygon(rect, grid, big))).toEqual(sorted(["0,0", "1,0", "2,0", "0,1", "1,1", "2,1"]));
  });

  it("follows the grid offset", () => {
    const cells = cellsInPolygon(rect, { ...grid, offsetX: 5 }, big);
    // centri in x = 10 e 20 (quelli a 0 e 30 stanno sul bordo: esclusi) → colonne 0 e 1
    expect(sorted(cells)).toEqual(sorted(["0,0", "1,0", "0,1", "1,1"]));
  });

  it("handles concave shapes (pari/dispari per riga)", () => {
    // U: due colonne alte 3 celle unite in basso
    const u = [0, 0, 10, 0, 10, 20, 20, 20, 20, 0, 30, 0, 30, 30, 0, 30];
    const cells = cellsInPolygon(u, grid, big);
    expect(cells).toContain("0,0");
    expect(cells).toContain("2,0");
    expect(cells).not.toContain("1,0");
    expect(cells).not.toContain("1,1");
    expect(cells).toContain("1,2");
  });

  it("is clipped to the limit, so unlimited vision stays cheap", () => {
    const huge = [-20_000, -20_000, 20_000, -20_000, 20_000, 20_000, -20_000, 20_000];
    const cells = cellsInPolygon(huge, grid, { minX: 0, minY: 0, maxX: 30, maxY: 20 });
    expect(sorted(cells)).toEqual(sorted(["0,0", "1,0", "2,0", "0,1", "1,1", "2,1"]));
  });

  it("returns nothing for degenerate polygons or outside the limit", () => {
    expect(cellsInPolygon([0, 0, 10, 10], grid, big)).toEqual([]);
    expect(cellsInPolygon(rect, grid, { minX: 100, minY: 100, maxX: 200, maxY: 200 })).toEqual([]);
  });

  it("agrees with a real visibility polygon", () => {
    const poly = visibilityPolygon({ x: 0, y: 0 }, [], 25);
    const cells = cellsInPolygon(poly, grid, big);
    expect(cells).toContain("0,0");
    expect(cells).toContain("-1,-1");
    expect(cells).toContain("1,1"); // centro a ~21 px
    expect(cells).not.toContain("2,2"); // centro a ~35 px
  });
});

describe("visibleCells", () => {
  it("merges several polygons without duplicates", () => {
    const shifted = rect.map((v, i) => (i % 2 === 0 ? v + 20 : v));
    const cells = visibleCells([rect, shifted], grid, big);
    expect(cells).toHaveLength(new Set(cells).size);
    expect(cells).toHaveLength(10); // colonne 0-4, righe 0-1
  });
});

describe("addExplored / resetExplored", () => {
  it("adds only new cells, keeping the same scene when nothing changes", () => {
    const s = { ...newScene(), explored: ["0,0"] };
    const next = addExplored(s, ["0,0", "1,0", "1,0"]);
    expect(next.explored).toEqual(["0,0", "1,0"]);
    expect(addExplored(next, ["1,0"])).toBe(next);
    expect(addExplored(s, [])).toBe(s);
  });

  it("stops at the maximum the schema accepts", () => {
    const full = { ...newScene(), explored: Array.from({ length: MAX_EXPLORED_CELLS - 1 }, (_, i) => cellKey(i, 0)) };
    const next = addExplored(full, ["0,1", "0,2"]);
    expect(next.explored).toHaveLength(MAX_EXPLORED_CELLS);
    expect(next.explored).toContain("0,1");
    expect(next.explored).not.toContain("0,2");
  });

  it("reset empties the memory", () => {
    const s = { ...newScene(), explored: ["0,0"] };
    expect(resetExplored(s).explored).toEqual([]);
    const empty = newScene();
    expect(resetExplored(empty)).toBe(empty);
  });
});

describe("exploredRuns", () => {
  it("joins adjacent cells of a row, ignoring order and duplicates", () => {
    expect(exploredRuns(["2,0", "0,0", "1,0", "1,0", "5,0", "0,1", "-1,1"])).toEqual([
      { x: 0, y: 0, w: 3 },
      { x: 5, y: 0, w: 1 },
      { x: -1, y: 1, w: 2 },
    ]);
  });
});

describe("scene schema: explored", () => {
  it("defaults to nothing explored for scenes saved before", () => {
    const { explored, ...old } = newScene();
    expect(explored).toEqual([]);
    expect(SceneSchema.parse(old).explored).toEqual([]);
  });

  it("only accepts integer cell keys", () => {
    const s = newScene();
    expect(SceneSchema.safeParse({ ...s, explored: ["3,-4"] }).success).toBe(true);
    expect(SceneSchema.safeParse({ ...s, explored: ["3;4"] }).success).toBe(false);
    expect(SceneSchema.safeParse({ ...s, explored: ["1.5,2"] }).success).toBe(false);
  });
});

describe("withoutUnseenTokens", () => {
  const scene = () => {
    const s = newScene();
    s.grid = { ...s.grid, cellPx: 10, offsetX: 0, offsetY: 0 };
    s.tokens = [
      { id: "pc", ref: { kind: "pc", id: "aria" }, x: 50, y: 50 },
      { id: "near", ref: { kind: "npc", id: "gob" }, x: 1, y: 0 },
      { id: "far", ref: { kind: "npc", id: "ogre" }, x: 10, y: 10 },
    ];
    return s;
  };

  it("keeps player characters and NPCs in sight, drops NPCs only remembered", () => {
    const s = withoutUnseenTokens(scene(), [rect], () => 1);
    expect(s.tokens.map((t) => t.id)).toEqual(["pc", "near"]);
  });

  it("does nothing without vision polygons", () => {
    const s = scene();
    expect(withoutUnseenTokens(s, [], () => 1)).toBe(s);
  });
});
