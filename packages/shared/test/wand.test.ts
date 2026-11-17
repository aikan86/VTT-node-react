import { describe, expect, it } from "vitest";
import { floodFill, magicWand, simplifyPolygon, simplifyToLimit, traceContour, type Raster } from "../src/wand";
import { pointInPolygon } from "../src/visibility";

const COLORS: Record<string, [number, number, number, number]> = {
  ".": [240, 240, 240, 255], // pavimento
  "#": [40, 40, 40, 255], // roccia
  "+": [60, 52, 48, 255], // roccia un po' diversa (entro la tolleranza)
  "o": [200, 30, 30, 255],
  " ": [0, 0, 0, 0], // trasparente
};

/** Immagine da righe di caratteri (vedi COLORS). */
function raster(rows: string[]): Raster {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => [...row].forEach((ch, x) => data.set(COLORS[ch]!, (y * width + x) * 4)));
  return { width, height, data };
}

const pairs = (p: number[]) => Array.from({ length: p.length / 2 }, (_, i) => [p[2 * i], p[2 * i + 1]]);

describe("floodFill", () => {
  const img = raster([
    "......", //
    ".##+..",
    ".#....",
    "....#.",
  ]);

  it("takes the 4-connected pixels within the tolerance", () => {
    const r = floodFill(img, 1, 1, 32);
    expect(r.count).toBe(4); // ## + e # sotto; non il # isolato in basso a destra
    expect(r.mask[1 * 6 + 3]).toBe(1);
    expect(r.mask[3 * 6 + 4]).toBe(0);
  });

  it("is stricter with a low tolerance", () => {
    expect(floodFill(img, 1, 1, 5).count).toBe(3);
  });

  it("does not cross diagonal gaps", () => {
    expect(floodFill(raster(["#.", ".#"]), 0, 0, 10).count).toBe(1);
  });

  it("treats transparent pixels apart from any colour", () => {
    const r = floodFill(raster(["  #", "  #"]), 0, 0, 255);
    expect(r.count).toBe(4);
    expect(floodFill(raster(["##", "# "]), 0, 0, 255).count).toBe(3);
  });

  it("is empty outside the image", () => {
    expect(floodFill(img, -1, 0, 10).count).toBe(0);
    expect(floodFill(img, 6, 0, 10).count).toBe(0);
  });
});

describe("traceContour", () => {
  it("draws a single pixel as its four corners, clockwise", () => {
    expect(traceContour(floodFill(raster(["#"]), 0, 0, 0))).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
  });

  it("keeps only the corners of a rectangle", () => {
    const r = floodFill(raster(["....", ".##.", ".##.", ".##.", "...."]), 1, 1, 10);
    expect(pairs(traceContour(r))).toEqual([
      [1, 1],
      [3, 1],
      [3, 4],
      [1, 4],
    ]);
  });

  it("follows an L shape", () => {
    const r = floodFill(raster(["#..", "#..", "###"]), 0, 0, 10);
    expect(pairs(traceContour(r))).toEqual([
      [0, 0],
      [1, 0],
      [1, 2],
      [3, 2],
      [3, 3],
      [0, 3],
    ]);
  });

  it("ignores holes: only the outer outline", () => {
    const r = floodFill(raster(["####", "#..#", "#..#", "####"]), 0, 0, 10);
    expect(pairs(traceContour(r))).toEqual([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ]);
  });

  it("encloses every pixel of an irregular blob", () => {
    const rows = ["..........", "...###....", "..#####...", ".#######..", "..######..", "...##.##..", ".........."];
    const r = floodFill(raster(rows), 4, 2, 10);
    const polygon = traceContour(r);
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === "#") expect(pointInPolygon({ x: x + 0.5, y: y + 0.5 }, polygon), `${x},${y}`).toBe(true);
      }),
    );
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, polygon)).toBe(false);
  });
});

describe("simplifyPolygon", () => {
  /** Scalinata di pixel lungo la diagonale: tanti vertici quasi allineati. */
  const staircase = (n: number) => {
    const p = [0, 0];
    for (let i = 1; i <= n; i++) p.push(i, i - 1, i, i);
    p.push(0, n);
    return p;
  };

  it("straightens a pixel staircase into a triangle", () => {
    const s = staircase(20);
    expect(s.length / 2).toBe(42);
    expect(pairs(simplifyPolygon(s, 1.5))).toEqual([
      [0, 0],
      [20, 20],
      [0, 20],
    ]);
  });

  it("keeps real corners", () => {
    const rect = [0, 0, 10, 0, 10, 5, 0, 5];
    expect(simplifyPolygon(rect, 1)).toEqual(rect);
  });

  it("raises the tolerance until the vertex limit is met", () => {
    const circle: number[] = [];
    for (let i = 0; i < 400; i++) circle.push(100 + 90 * Math.cos((i / 400) * 2 * Math.PI), 100 + 90 * Math.sin((i / 400) * 2 * Math.PI));
    const out = simplifyToLimit(circle, 0.01, 30);
    expect(out.length / 2).toBeLessThanOrEqual(30);
    expect(out.length / 2).toBeGreaterThanOrEqual(6);
  });
});

describe("magicWand", () => {
  const img = raster([
    "............",
    "..oooo......",
    "..oooooo....",
    "..oooooo....",
    "....oooo....",
    "............",
  ]);

  it("returns the simplified outline of the clicked area", () => {
    const r = magicWand(img, 3, 2, { minPixels: 4 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pixels).toBe(20);
    expect(pointInPolygon({ x: 3.5, y: 2.5 }, r.polygon)).toBe(true);
    expect(pointInPolygon({ x: 9.5, y: 2.5 }, r.polygon)).toBe(false);
    expect(r.polygon.length / 2).toBeLessThanOrEqual(8);
  });

  it("refuses the floor (too large), specks (too small) and clicks outside", () => {
    expect(magicWand(img, 0, 0)).toEqual({ ok: false, reason: "too-large" });
    expect(magicWand(img, 3, 2, { minPixels: 50 })).toEqual({ ok: false, reason: "too-small" });
    expect(magicWand(img, 20, 2)).toEqual({ ok: false, reason: "outside" });
  });
});
