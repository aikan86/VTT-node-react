import { EFFECT_LABELS, EFFECT_SHAPES, type Drawing, type Effect, type EffectShape } from "@vtt/shared";
import { NumberInput } from "../../../components/NumberInput";
import type { DrawMode, DrawTool, EffectTool } from "../types";
import styles from "../Battlefield.module.css";

interface Props {
  tool: EffectTool;
  onTool: (tool: EffectTool) => void;
  drawTool: DrawTool;
  onDrawTool: (tool: DrawTool) => void;
  selected: Effect | undefined;
  onChange: (effect: Effect) => void;
  selectedDrawing: Drawing | undefined;
  onDrawingChange: (drawing: Drawing) => void;
  /** Testo appena piazzato: il campo prende il focus per scriverlo subito. */
  focusText: boolean;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onClearDrawings: () => void;
  count: number;
  drawingCount: number;
}

const DRAW_MODES: { mode: DrawMode; label: string; hint: string }[] = [
  { mode: "text", label: "T Testo", hint: "Clicca sulla mappa per piazzare il testo." },
  { mode: "line", label: "╱ Linea", hint: "Trascina per tracciare una linea (Shift: angoli di 45°)." },
  { mode: "freehand", label: "✎ Mano libera", hint: "Trascina per disegnare." },
  { mode: "eraser", label: "⌫ Gomma", hint: "Clicca o trascina sopra un disegno per eliminarlo." },
];

const DRAWING_LABELS: Record<Drawing["kind"], string> = { text: "Testo", line: "Linea", freehand: "Mano libera" };

const SIZE_LABEL: Record<EffectShape, string> = {
  circle: "Raggio (ft)",
  square: "Lato (ft)",
  cone: "Lunghezza (ft)",
  line: "Lunghezza (ft)",
};

export function EffectsPanel(props: Props) {
  const { tool, onTool, drawTool, onDrawTool, selected, onChange, selectedDrawing, onDelete, onClearAll, count } = props;
  const activeMode = DRAW_MODES.find((m) => m.mode === drawTool.mode);

  const setMode = (mode: DrawMode | null) => {
    onDrawTool({ ...drawTool, mode });
    if (mode && tool.placing) onTool({ ...tool, placing: false });
  };

  return (
    <>
      <section className={styles.section}>
        <h3>Nuovo effetto</h3>
        <div className={styles.tools}>
          {EFFECT_SHAPES.map((shape) => (
            <button key={shape} className={tool.shape === shape ? "active" : ""} aria-pressed={tool.shape === shape} onClick={() => onTool({ ...tool, shape })}>
              {EFFECT_LABELS[shape]}
            </button>
          ))}
        </div>
        <div className={styles.grid2}>
          <label className="field">
            {SIZE_LABEL[tool.shape]}
            <NumberInput value={tool.sizeFt} onChange={(v) => v && onTool({ ...tool, sizeFt: v })} min={1} max={1000} />
          </label>
          {tool.shape === "line" ? (
            <label className="field">
              Larghezza (ft)
              <NumberInput value={tool.widthFt} onChange={(v) => v && onTool({ ...tool, widthFt: v })} min={1} max={1000} />
            </label>
          ) : (
            <span />
          )}
          <label className="field">
            Colore
            <input type="color" value={tool.color} onChange={(e) => onTool({ ...tool, color: e.target.value })} />
          </label>
        </div>
        <button
          className={tool.placing ? "active" : "primary"}
          aria-pressed={tool.placing}
          onClick={() => {
            onTool({ ...tool, placing: !tool.placing });
            if (!tool.placing && drawTool.mode) onDrawTool({ ...drawTool, mode: null });
          }}
        >
          {tool.placing ? "Piazzamento attivo: clicca sulla mappa" : "Piazza effetto"}
        </button>
        {count > 0 && (
          <button className="danger" onClick={onClearAll}>
            Rimuovi tutti gli effetti ({count})
          </button>
        )}
      </section>

      <section className={styles.section}>
        <h3>Disegno</h3>
        <div className={styles.tools}>
          {DRAW_MODES.map(({ mode, label }) => (
            <button key={mode} className={drawTool.mode === mode ? "active" : ""} aria-pressed={drawTool.mode === mode} onClick={() => setMode(drawTool.mode === mode ? null : mode)}>
              {label}
            </button>
          ))}
        </div>
        <div className={styles.grid2}>
          <label className="field">
            Colore
            <input type="color" value={drawTool.color} onChange={(e) => onDrawTool({ ...drawTool, color: e.target.value })} />
          </label>
          {drawTool.mode === "text" ? (
            <label className="field">
              Dimensione testo
              <NumberInput value={drawTool.fontSize} onChange={(v) => v && onDrawTool({ ...drawTool, fontSize: v })} min={4} max={400} />
            </label>
          ) : (
            <label className="field">
              Spessore
              <NumberInput value={drawTool.strokeWidth} onChange={(v) => v && onDrawTool({ ...drawTool, strokeWidth: v })} min={1} max={100} />
            </label>
          )}
        </div>
        {activeMode && <p className={styles.callout}>{activeMode.hint}</p>}
        {props.drawingCount > 0 && (
          <button className="danger" onClick={props.onClearDrawings}>
            Cancella tutti i disegni ({props.drawingCount})
          </button>
        )}
      </section>

      {selectedDrawing && <DrawingEditor drawing={selectedDrawing} focusText={props.focusText} onChange={props.onDrawingChange} onDelete={onDelete} />}

      {selected && (
        <section className={styles.selected} aria-label="Effetto selezionato">
          <h3 style={{ margin: 0 }}>{EFFECT_LABELS[selected.shape]}</h3>
          <div className={styles.grid2}>
            <label className="field">
              {SIZE_LABEL[selected.shape]}
              <NumberInput value={selected.sizeFt} onChange={(v) => v && onChange({ ...selected, sizeFt: v })} min={1} max={1000} />
            </label>
            {selected.shape === "line" && (
              <label className="field">
                Larghezza (ft)
                <NumberInput value={selected.widthFt ?? 5} onChange={(v) => v && onChange({ ...selected, widthFt: v })} min={1} max={1000} />
              </label>
            )}
            {selected.shape !== "circle" && (
              <label className="field">
                Direzione (°)
                <NumberInput value={selected.rotation} onChange={(v) => onChange({ ...selected, rotation: v ?? 0 })} min={-360} max={360} />
              </label>
            )}
            <label className="field">
              Colore
              <input type="color" value={selected.color} onChange={(e) => onChange({ ...selected, color: e.target.value })} />
            </label>
            <label className="field">
              Opacità
              <input type="range" min={0.1} max={1} step={0.05} value={selected.opacity} onChange={(e) => onChange({ ...selected, opacity: Number(e.target.value) })} />
            </label>
          </div>
          <button className="danger" onClick={() => onDelete(selected.id)}>
            Elimina effetto
          </button>
        </section>
      )}
    </>
  );
}

function DrawingEditor({ drawing, focusText, onChange, onDelete }: { drawing: Drawing; focusText: boolean; onChange: (d: Drawing) => void; onDelete: (id: string) => void }) {
  return (
    <section className={styles.selected} aria-label="Disegno selezionato">
      <h3 style={{ margin: 0 }}>{DRAWING_LABELS[drawing.kind]}</h3>
      {drawing.kind === "text" && (
        <label className="field">
          Testo
          <textarea
            key={drawing.id}
            rows={3}
            maxLength={500}
            autoFocus={focusText}
            value={drawing.text}
            onChange={(e) => onChange({ ...drawing, text: e.target.value })}
          />
        </label>
      )}
      <div className={styles.grid2}>
        <label className="field">
          Colore
          <input type="color" value={drawing.color} onChange={(e) => onChange({ ...drawing, color: e.target.value })} />
        </label>
        {drawing.kind === "text" ? (
          <label className="field">
            Dimensione
            <NumberInput value={drawing.fontSize} onChange={(v) => v && onChange({ ...drawing, fontSize: v })} min={4} max={400} />
          </label>
        ) : (
          <label className="field">
            Spessore
            <NumberInput value={drawing.strokeWidth} onChange={(v) => v && onChange({ ...drawing, strokeWidth: v })} min={1} max={100} />
          </label>
        )}
      </div>
      <span className="muted" style={{ fontSize: "0.8rem" }}>
        {drawing.kind === "line" ? "Trascina gli estremi per modificarla (Shift: angoli di 45°)" : drawing.kind === "text" ? "Maniglie: ruota e ridimensiona" : "Trascina per spostare"}
      </span>
      <button className="danger" onClick={() => onDelete(drawing.id)}>
        Elimina disegno
      </button>
    </section>
  );
}
