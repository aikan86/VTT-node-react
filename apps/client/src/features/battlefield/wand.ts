import { magicWand, type Background, type Point, type Raster, type WandResult } from "@vtt/shared";

/** Lato massimo dell'immagine analizzata: oltre si rimpicciolisce (più veloce, contorni comunque precisi a scala di mappa). */
const MAX_RASTER_SIDE = 1600;

export interface ImageRaster extends Raster {
  /** Dimensioni originali dell'immagine. */
  naturalWidth: number;
  naturalHeight: number;
}

const cache = new Map<string, Promise<ImageRaster>>();

/** Pixel dell'immagine (ridotta se molto grande), letti una volta per indirizzo. */
export function loadRaster(url: string): Promise<ImageRaster> {
  let promise = cache.get(url);
  if (!promise) {
    promise = new Promise<ImageRaster>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, MAX_RASTER_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(1, Math.round(img.naturalWidth * k));
        const height = Math.max(1, Math.round(img.naturalHeight * k));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return reject(new Error("Impossibile leggere l'immagine"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve({ width, height, data: ctx.getImageData(0, 0, width, height).data, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
      };
      img.onerror = () => reject(new Error("Impossibile caricare l'immagine della mappa"));
      img.src = url;
    });
    promise.catch(() => cache.delete(url));
    cache.set(url, promise);
  }
  return promise;
}

type Placement = Pick<Background, "x" | "y" | "widthPx" | "heightPx" | "rotation">;

/** Da pixel del mondo a pixel del raster (l'immagine è ruotata attorno al suo centro, come sulla mappa). */
export function worldToRaster(bg: Placement, raster: Pick<Raster, "width" | "height">, p: Point): Point {
  const cx = bg.x + bg.widthPx / 2;
  const cy = bg.y + bg.heightPx / 2;
  const rad = (-bg.rotation * Math.PI) / 180;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const ux = dx * Math.cos(rad) - dy * Math.sin(rad) + bg.widthPx / 2;
  const uy = dx * Math.sin(rad) + dy * Math.cos(rad) + bg.heightPx / 2;
  return { x: (ux / bg.widthPx) * raster.width, y: (uy / bg.heightPx) * raster.height };
}

/** Inverso di `worldToRaster`, su una lista appiattita [x1, y1, ...]. */
export function rasterToWorld(bg: Placement, raster: Pick<Raster, "width" | "height">, points: number[]): number[] {
  const cx = bg.x + bg.widthPx / 2;
  const cy = bg.y + bg.heightPx / 2;
  const rad = (bg.rotation * Math.PI) / 180;
  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const ux = (points[i]! / raster.width) * bg.widthPx - bg.widthPx / 2;
    const uy = (points[i + 1]! / raster.height) * bg.heightPx - bg.heightPx / 2;
    out.push(cx + ux * Math.cos(rad) - uy * Math.sin(rad), cy + ux * Math.sin(rad) + uy * Math.cos(rad));
  }
  return out;
}

/** Bacchetta magica sul punto cliccato (pixel del mondo): contorno in pixel del mondo, o il motivo del rifiuto. */
export function wandOnRaster(bg: Placement, raster: Raster, world: Point, tolerance: number): WandResult {
  const p = worldToRaster(bg, raster, world);
  const result = magicWand(raster, p.x, p.y, { tolerance });
  return result.ok ? { ...result, polygon: rasterToWorld(bg, raster, result.polygon) } : result;
}

export const WAND_ERRORS: Record<Exclude<WandResult, { ok: true }>["reason"], string> = {
  outside: "Hai cliccato fuori dall'immagine della mappa.",
  "too-small": "L'area di quel colore è troppo piccola: aumenta la tolleranza o clicca più al centro.",
  "too-large": "L'area è troppo grande (più di metà mappa, forse il pavimento): diminuisci la tolleranza.",
};
