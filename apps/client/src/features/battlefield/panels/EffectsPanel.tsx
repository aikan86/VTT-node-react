import { EFFECT_LABELS, EFFECT_SHAPES, type Effect, type EffectShape } from "@vtt/shared";
import { NumberInput } from "../../../components/NumberInput";
import type { EffectTool } from "../types";
import styles from "../Battlefield.module.css";

interface Props {
  tool: EffectTool;
  onTool: (tool: EffectTool) => void;
  selected: Effect | undefined;
  onChange: (effect: Effect) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  count: number;
}

const SIZE_LABEL: Record<EffectShape, string> = {
  circle: "Raggio (ft)",
  square: "Lato (ft)",
  cone: "Lunghezza (ft)",
  line: "Lunghezza (ft)",
};

export function EffectsPanel({ tool, onTool, selected, onChange, onDelete, onClearAll, count }: Props) {
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
        <button className={tool.placing ? "active" : "primary"} aria-pressed={tool.placing} onClick={() => onTool({ ...tool, placing: !tool.placing })}>
          {tool.placing ? "Piazzamento attivo: clicca sulla mappa" : "Piazza effetto"}
        </button>
        {count > 0 && (
          <button className="danger" onClick={onClearAll}>
            Rimuovi tutti gli effetti ({count})
          </button>
        )}
      </section>

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
