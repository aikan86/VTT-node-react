import { useRef, useState } from "react";
import type { Background, Grid, Scene } from "@vtt/shared";
import { api } from "../../../api/http";
import { NumberInput } from "../../../components/NumberInput";
import { reportError } from "../../../store/statusStore";
import styles from "../Battlefield.module.css";
import { backgroundBounds, withBackgroundGeometry } from "../geometry";

interface Props {
  scene: Scene;
  onUpdate: (fn: (scene: Scene) => Scene) => void;
}

function loadImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Impossibile leggere l'immagine caricata"));
    img.src = url;
  });
}

/** Righe/colonne sufficienti a coprire l'immagine (anche spostata o ruotata). */
const fitGrid = (grid: Grid, bg: Background): Grid => {
  const b = backgroundBounds(bg);
  return {
    ...grid,
    cols: Math.max(1, Math.ceil((b.maxX - grid.offsetX) / grid.cellPx)),
    rows: Math.max(1, Math.ceil((b.maxY - grid.offsetY) / grid.cellPx)),
  };
};

export function BackgroundPanel({ scene, onUpdate }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const g = scene.grid;
  const setGrid = (patch: Partial<Grid>) => onUpdate((s) => ({ ...s, grid: { ...s.grid, ...patch } }));
  const [keepRatio, setKeepRatio] = useState(true);
  const bg = scene.background;
  const setBg = (patch: Partial<Background>) => {
    if (bg) onUpdate((s) => withBackgroundGeometry(s, { ...bg, ...patch }));
  };
  const setSize = (dim: "widthPx" | "heightPx", value: number) => {
    if (!bg) return;
    const other = dim === "widthPx" ? "heightPx" : "widthPx";
    const ratio = bg[other] / bg[dim];
    // il centro resta fermo, come quando si ridimensiona dalla mappa
    const next = { ...bg, [dim]: value, ...(keepRatio ? { [other]: Math.max(1, Math.round(value * ratio)) } : {}) };
    setBg({ ...next, x: Math.round(bg.x + (bg.widthPx - next.widthPx) / 2), y: Math.round(bg.y + (bg.heightPx - next.heightPx) / 2) });
  };
  const resetBg = async () => {
    if (!bg) return;
    try {
      const { width, height } = await loadImageSize(bg.imageUrl);
      setBg({ x: 0, y: 0, widthPx: width, heightPx: height, rotation: 0 });
    } catch (err) {
      reportError(err);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await api.upload(file);
      const { width, height } = await loadImageSize(url);
      const background: Background = { imageUrl: url, widthPx: width, heightPx: height, x: 0, y: 0, rotation: 0 };
      onUpdate((s) => ({ ...s, background, grid: fitGrid(s.grid, background) }));
    } catch (err) {
      reportError(err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <section className={styles.section}>
        <h3>Immagine mappa</h3>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <div className="row">
          <button className="primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? "Caricamento…" : scene.background ? "Sostituisci immagine" : "Carica immagine"}
          </button>
          {scene.background && (
            <button className="danger" onClick={() => onUpdate((s) => ({ ...s, background: null }))}>
              Rimuovi
            </button>
          )}
        </div>
      </section>

      {bg && (
        <section className={styles.section} aria-label="Posizione immagine">
          <h3>Posizione immagine</h3>
          <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
            Clicca l'immagine sulla mappa: trascinala per spostarla, usa le maniglie per ridimensionarla (angoli = proporzioni
            mantenute) e quella in alto per ruotarla.
          </p>
          <div className={styles.grid2}>
            <label className="field">
              X (px)
              <NumberInput value={bg.x} onChange={(v) => setBg({ x: v ?? 0 })} min={-20000} max={20000} />
            </label>
            <label className="field">
              Y (px)
              <NumberInput value={bg.y} onChange={(v) => setBg({ y: v ?? 0 })} min={-20000} max={20000} />
            </label>
            <label className="field">
              Larghezza (px)
              <NumberInput value={bg.widthPx} onChange={(v) => v && setSize("widthPx", v)} min={10} max={40000} />
            </label>
            <label className="field">
              Altezza (px)
              <NumberInput value={bg.heightPx} onChange={(v) => v && setSize("heightPx", v)} min={10} max={40000} />
            </label>
            <label className="field">
              Rotazione (°)
              <NumberInput value={bg.rotation} onChange={(v) => setBg({ rotation: (((v ?? 0) % 360) + 360) % 360 })} min={-360} max={360} />
            </label>
          </div>
          <label className="row">
            <input type="checkbox" checked={keepRatio} onChange={(e) => setKeepRatio(e.target.checked)} />
            Mantieni proporzioni (campi numerici)
          </label>
          <div className="row">
            <button onClick={() => setBg({ rotation: (bg.rotation + 90) % 360 })}>↻ Ruota 90°</button>
            <button onClick={() => void resetBg()}>Ripristina originale</button>
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h3>Griglia</h3>
        <label className="row">
          <input type="checkbox" checked={g.visible} onChange={(e) => setGrid({ visible: e.target.checked })} />
          Mostra griglia
        </label>
        <div className={styles.grid2}>
          <label className="field">
            Cella (px)
            <NumberInput value={g.cellPx} onChange={(v) => v && setGrid({ cellPx: v })} min={8} max={400} />
          </label>
          <label className="field">
            Piedi per cella
            <NumberInput value={g.feetPerCell} onChange={(v) => v && setGrid({ feetPerCell: v })} min={1} max={100} />
          </label>
          <label className="field">
            Offset X
            <NumberInput value={g.offsetX} onChange={(v) => setGrid({ offsetX: v ?? 0 })} min={-400} max={400} />
          </label>
          <label className="field">
            Offset Y
            <NumberInput value={g.offsetY} onChange={(v) => setGrid({ offsetY: v ?? 0 })} min={-400} max={400} />
          </label>
          <label className="field">
            Colonne
            <NumberInput value={g.cols} onChange={(v) => v && setGrid({ cols: v })} min={1} max={500} />
          </label>
          <label className="field">
            Righe
            <NumberInput value={g.rows} onChange={(v) => v && setGrid({ rows: v })} min={1} max={500} />
          </label>
          <label className="field">
            Colore
            <input type="color" value={g.color} onChange={(e) => setGrid({ color: e.target.value })} />
          </label>
          <label className="field">
            Opacità
            <input type="range" min={0} max={1} step={0.05} value={g.opacity} onChange={(e) => setGrid({ opacity: Number(e.target.value) })} />
          </label>
        </div>
        {scene.background && (
          <button onClick={() => onUpdate((s) => (s.background ? { ...s, grid: fitGrid(s.grid, s.background) } : s))}>
            Adatta righe/colonne all'immagine
          </button>
        )}
      </section>
    </>
  );
}
