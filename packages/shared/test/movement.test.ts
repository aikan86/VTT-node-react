import { describe, expect, it } from "vitest";
import { cellKey } from "../src/fog";
import { coveredCells, DEFAULT_SPEED_FT, movementRange, type Reachable } from "../src/movement";
import { newScene, TokenSchema, type MapElement, type Scene } from "../src/schemas/scene";

function scene(elements: MapElement[] = []): Scene {
  const s = newScene();
  return { ...s, grid: { ...s.grid, cellPx: 10, offsetX: 0, offsetY: 0, feetPerCell: 5 }, elements };
}

const el = (type: MapElement["type"], x: number, y: number, w: number, h: number, extra: Partial<MapElement> = {}): MapElement => ({
  id: `${type}-${x}-${y}`,
  type,
  x,
  y,
  w,
  h,
  rotation: 0,
  color: "#000000",
  ...extra,
});

const at = (range: Reachable[], x: number, y: number) => range.find((r) => r.x === x && r.y === y);
const origin = { x: 0, y: 0 };

describe("movementRange", () => {
  it("in the open reaches every cell within speed in 8 directions, diagonals counting one square", () => {
    const range = movementRange(scene(), origin, 1, 30);
    expect(range).toHaveLength(13 * 13);
    expect(at(range, 0, 0)?.costFt).toBe(0);
    expect(at(range, 6, 6)?.costFt).toBe(30);
    expect(at(range, -6, 3)?.costFt).toBe(30);
    expect(at(range, 2, 1)?.costFt).toBe(10);
    expect(at(range, 7, 0)).toBeUndefined();
  });

  it("only keeps the start with no speed", () => {
    expect(movementRange(scene(), origin, 1, 0)).toEqual([{ x: 0, y: 0, costFt: 0 }]);
    expect(movementRange(scene(), origin, 1, 4)).toHaveLength(1);
  });

  it("does not cross a wall", () => {
    const range = movementRange(scene([el("wall", 3, -10, 1, 20)]), origin, 1, 30);
    expect(range.every((r) => r.x < 3)).toBe(true);
    expect(at(range, 2, 0)).toBeDefined();
  });

  it("goes around a wall, paying for the detour", () => {
    // muro da y = -10 a 1 in x = 2: si passa sotto, da y = 2
    const range = movementRange(scene([el("wall", 2, -10, 1, 12)]), origin, 1, 30);
    // (0,1) → (1,2) → (2,2) → (3,2) → (3,1) → (3,0): 6 passi, gli spigoli del muro non si tagliano
    expect(at(range, 3, 0)?.costFt).toBe(30);
    expect(at(range, 3, -1)).toBeUndefined(); // ne servirebbero 7
    expect(at(range, 2, 2)?.costFt).toBe(15);
  });

  it("is stopped by thin walls drawn on the line between cells", () => {
    const thin = el("wall", 1, -10, 0.1, 20); // tra la colonna 0 e la colonna 1, non contiene centri di cella
    const range = movementRange(scene([thin]), origin, 1, 30);
    expect(range.every((r) => r.x <= 0)).toBe(true);
  });

  it("does not cut wall corners diagonally", () => {
    const pillar = el("obstacle", 1, 0, 1, 1);
    const oneStep = movementRange(scene([pillar]), origin, 1, 5);
    expect(at(oneStep, 1, 1)).toBeUndefined(); // passerebbe sullo spigolo del pilastro
    expect(at(oneStep, -1, 1)?.costFt).toBe(5);
    expect(at(oneStep, 1, 0)).toBeUndefined(); // occupato
    expect(at(movementRange(scene([pillar]), origin, 1, 10), 1, 1)?.costFt).toBe(10); // girando attorno
  });

  it("closed doors block, open doors let through", () => {
    const door = el("door", 1, -10, 1, 20);
    expect(at(movementRange(scene([door]), origin, 1, 10), 2, 0)).toBeUndefined();
    expect(at(movementRange(scene([{ ...door, open: true }]), origin, 1, 10), 2, 0)?.costFt).toBe(10);
  });

  it("pays double to enter difficult terrain", () => {
    const mud = el("difficult", 1, -10, 10, 20);
    const range = movementRange(scene([mud]), origin, 1, 30);
    expect(at(range, 1, 0)?.costFt).toBe(10);
    expect(at(range, 2, 0)?.costFt).toBe(20);
    expect(at(range, 3, 0)?.costFt).toBe(30);
    expect(at(range, 4, 0)).toBeUndefined();
    expect(at(range, -6, 0)?.costFt).toBe(30); // dall'altra parte il terreno è normale
  });

  it("respects rotated walls", () => {
    // muro lungo ruotato di 90°: occupa la colonna x = 2 (da 1 a 2 in celle, ruotato attorno a (3, -10))
    const wall = el("wall", 3, -10, 20, 1, { rotation: 90 });
    expect(movementRange(scene([wall]), origin, 1, 30).every((r) => r.x < 2)).toBe(true);
  });

  it("moves large tokens only where they fit", () => {
    // varco di una sola casella tra due muri, in x = 3
    const walls = [el("wall", 3, -10, 1, 10), el("wall", 3, 1, 1, 10)];
    const small = movementRange(scene(walls), origin, 1, 30);
    expect(at(small, 4, 0)).toBeDefined();
    const large = movementRange(scene(walls), origin, 2, 30);
    expect(large.every((r) => r.x + 2 <= 3)).toBe(true);
  });

  it("returns the start first and every position once", () => {
    const range = movementRange(scene([el("difficult", -2, -2, 4, 4)]), { x: 5, y: 5 }, 1, 60);
    expect(range[0]).toEqual({ x: 5, y: 5, costFt: 0 });
    expect(new Set(range.map((r) => cellKey(r.x, r.y))).size).toBe(range.length);
    expect(range.map((r) => r.costFt)).toEqual([...range.map((r) => r.costFt)].sort((a, b) => a - b));
  });
});

describe("coveredCells", () => {
  it("covers the whole footprint with the cheapest cost", () => {
    const cells = coveredCells(
      [
        { x: 0, y: 0, costFt: 0 },
        { x: 1, y: 0, costFt: 5 },
      ],
      2,
    );
    expect(cells.size).toBe(6);
    expect(cells.get("1,1")).toBe(0);
    expect(cells.get("2,0")).toBe(5);
  });
});

describe("token speed", () => {
  it("is optional, with a sensible default", () => {
    const token = { id: "t", ref: { kind: "pc" as const, id: "a" }, x: 0, y: 0 };
    expect(TokenSchema.parse(token).speedFt).toBeUndefined();
    expect(TokenSchema.safeParse({ ...token, speedFt: 25 }).success).toBe(true);
    expect(TokenSchema.safeParse({ ...token, speedFt: -5 }).success).toBe(false);
    expect(DEFAULT_SPEED_FT).toBe(30);
  });
});
