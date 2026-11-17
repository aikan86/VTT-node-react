import { describe, expect, it } from "vitest";
import { rasterToWorld, wandOnRaster, worldToRaster } from "./wand";

const bg = { x: 100, y: 50, widthPx: 400, heightPx: 200, rotation: 0 };
const raster = { width: 200, height: 100 }; // immagine ridotta a metà

describe("magic wand coordinates", () => {
  it("maps world pixels onto the (scaled) image and back", () => {
    expect(worldToRaster(bg, raster, { x: 100, y: 50 })).toEqual({ x: 0, y: 0 });
    expect(worldToRaster(bg, raster, { x: 300, y: 150 })).toEqual({ x: 100, y: 50 });
    expect(rasterToWorld(bg, raster, [0, 0, 100, 50, 200, 100])).toEqual([100, 50, 300, 150, 500, 250]);
  });

  it("takes the rotation around the centre of the image into account", () => {
    const rotated = { ...bg, rotation: 90 };
    // ruotata di 90°: l'angolo in alto a sinistra dell'immagine finisce in alto a destra
    const [x, y] = rasterToWorld(rotated, raster, [0, 0]);
    expect(x).toBeCloseTo(400);
    expect(y).toBeCloseTo(-50);
    const back = worldToRaster(rotated, raster, { x: x!, y: y! });
    expect(back.x).toBeCloseTo(0);
    expect(back.y).toBeCloseTo(0);
  });

  // immagine 10x10 bianca con un quadrato scuro 5x5 (pixel 2-6), mostrata a 40 px del mondo per pixel
  const data = new Uint8ClampedArray(10 * 10 * 4).fill(255);
  for (let py = 2; py <= 6; py++) for (let px = 2; px <= 6; px++) data.set([0, 0, 0, 255], (py * 10 + px) * 4);
  const img = { width: 10, height: 10, data };
  const placed = { x: 0, y: 0, widthPx: 400, heightPx: 400, rotation: 0 };

  it("traces the clicked area in world pixels", () => {
    const r = wandOnRaster(placed, img, { x: 150, y: 150 }, 10);
    expect(r).toEqual({ ok: true, pixels: 25, polygon: [80, 80, 280, 80, 280, 280, 80, 280] });
  });

  it("explains why it refuses", () => {
    expect(wandOnRaster(placed, img, { x: 10, y: 10 }, 10)).toEqual({ ok: false, reason: "too-large" });
    expect(wandOnRaster(placed, img, { x: 500, y: 10 }, 10)).toEqual({ ok: false, reason: "outside" });
  });
});
