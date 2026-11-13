import { useRef, useState } from "react";
import type { Grid, Scene } from "@vtt/shared";
import { api } from "../../../api/http";
import { NumberInput } from "../../../components/NumberInput";
import { reportError } from "../../../store/statusStore";
import styles from "../Battlefield.module.css";

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

const fitGrid = (grid: Grid, width: number, height: number): Grid => ({
  ...grid,
  cols: Math.max(1, Math.ceil((width - grid.offsetX) / grid.cellPx)),
  rows: Math.max(1, Math.ceil((height - grid.offsetY) / grid.cellPx)),
});

export function BackgroundPanel({ scene, onUpdate }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const g = scene.grid;
  const setGrid = (patch: Partial<Grid>) => onUpdate((s) => ({ ...s, grid: { ...s.grid, ...patch } }));

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await api.upload(file);
      const { width, height } = await loadImageSize(url);
      onUpdate((s) => ({ ...s, background: { imageUrl: url, widthPx: width, heightPx: height }, grid: fitGrid(s.grid, width, height) }));
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
        {scene.background && (
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            {scene.background.widthPx} × {scene.background.heightPx} px
          </span>
        )}
      </section>

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
          <button onClick={() => onUpdate((s) => (s.background ? { ...s, grid: fitGrid(s.grid, s.background.widthPx, s.background.heightPx) } : s))}>
            Adatta righe/colonne all'immagine
          </button>
        )}
      </section>
    </>
  );
}
