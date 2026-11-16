import { ELEMENT_COLORS, ELEMENT_LABELS, ELEMENT_TYPES, type MapElement, type SightBlocker, type Vision } from "@vtt/shared";
import { NumberInput } from "../../../components/NumberInput";
import { SIGHT_COLOR, type ElementTool } from "../types";
import styles from "../Battlefield.module.css";

interface Props {
  tool: ElementTool;
  onTool: (tool: ElementTool) => void;
  selected: MapElement | undefined;
  onChange: (element: MapElement) => void;
  onDelete: (id: string) => void;
  selectedBlocker: SightBlocker | undefined;
  /** Vertici già cliccati della forma in tracciamento. */
  tracePoints: number;
  onCloseTrace: () => void;
  onCancelTrace: () => void;
  vision: Vision;
  onVision: (patch: Partial<Vision>) => void;
}

export function ElementsPanel({ tool, onTool, selected, onChange, onDelete, selectedBlocker, tracePoints, onCloseTrace, onCancelTrace, vision, onVision }: Props) {
  return (
    <>
      <section className={styles.section}>
        <h3>Strumento</h3>
        <div className={styles.tools}>
          <button className={tool === "select" ? "active" : ""} aria-pressed={tool === "select"} onClick={() => onTool("select")}>
            ↖ Seleziona
          </button>
          {ELEMENT_TYPES.map((type) => (
            <button key={type} className={tool === type ? "active" : ""} aria-pressed={tool === type} onClick={() => onTool(type)}>
              <span className="swatch" style={{ background: ELEMENT_COLORS[type], borderRadius: 2, marginRight: 6 }} />
              {ELEMENT_LABELS[type]}
            </button>
          ))}
          <button className={tool === "sight" ? "active" : ""} aria-pressed={tool === "sight"} onClick={() => onTool("sight")}>
            <span className="swatch" style={{ background: SIGHT_COLOR, borderRadius: 2, marginRight: 6 }} />
            Ostacolo alla vista
          </button>
        </div>
        {tool === "sight" ? (
          <>
            <p className={styles.callout}>
              Clicca i vertici attorno all'ostacolo (un edificio, un gruppo di alberi…). Chiudi la forma cliccando sul primo punto o con Invio; Backspace toglie
              l'ultimo punto.
            </p>
            {tracePoints > 0 && (
              <div className="row">
                <button disabled={tracePoints < 3} onClick={onCloseTrace}>
                  Chiudi forma ({tracePoints} punti)
                </button>
                <button onClick={onCancelTrace}>Annulla forma</button>
              </div>
            )}
          </>
        ) : (
          tool !== "select" && <p className={styles.callout}>Trascina sulla mappa per disegnare: {ELEMENT_LABELS[tool].toLowerCase()}.</p>
        )}
      </section>

      {selected && (
        <section className={styles.selected} aria-label="Elemento selezionato">
          <h3 style={{ margin: 0 }}>{ELEMENT_LABELS[selected.type]}</h3>
          <div className={styles.grid2}>
            <label className="field">
              Tipo
              <select
                value={selected.type}
                onChange={(e) => {
                  const type = e.target.value as MapElement["type"];
                  onChange({ ...selected, type, color: ELEMENT_COLORS[type] });
                }}
              >
                {ELEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ELEMENT_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Colore
              <input type="color" value={selected.color} onChange={(e) => onChange({ ...selected, color: e.target.value })} />
            </label>
          </div>
          <label className="field">
            Etichetta
            <input value={selected.label ?? ""} maxLength={80} onChange={(e) => onChange({ ...selected, label: e.target.value || undefined })} />
          </label>
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            {selected.w} × {selected.h} celle · trascina le maniglie per ridimensionare o ruotare
          </span>
          <button className="danger" onClick={() => onDelete(selected.id)}>
            Elimina elemento
          </button>
        </section>
      )}

      {selectedBlocker && (
        <section className={styles.selected} aria-label="Ostacolo alla vista selezionato">
          <h3 style={{ margin: 0 }}>Ostacolo alla vista</h3>
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            {selectedBlocker.points.length / 2} vertici · trascina la forma per spostarla, le maniglie per modificarla
          </span>
          <button className="danger" onClick={() => onDelete(selectedBlocker.id)}>
            Elimina ostacolo
          </button>
        </section>
      )}

      <section className={styles.section} aria-label="Visione del party">
        <h3>Visione del party</h3>
        <label className="row" style={{ flexWrap: "nowrap" }}>
          <input type="checkbox" checked={vision.enabled} onChange={(e) => onVision({ enabled: e.target.checked })} />
          Mostra cosa vede il party
        </label>
        <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
          I personaggi sulla mappa vedono a 360°. Muri, porte, ostacoli e le forme tracciate qui bloccano la vista; il resto resta visibile.
        </p>
        <div className={styles.grid2}>
          <label className="field">
            Raggio (ft, 0 = illimitato)
            <NumberInput value={vision.radiusFt} onChange={(v) => onVision({ radiusFt: v ?? 0 })} min={0} max={10000} />
          </label>
          <label className="field">
            Oscurità
            <input type="range" min={0.2} max={1} step={0.05} value={vision.darkness} onChange={(e) => onVision({ darkness: Number(e.target.value) })} />
          </label>
        </div>
      </section>
    </>
  );
}
