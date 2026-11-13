import { ELEMENT_COLORS, ELEMENT_LABELS, ELEMENT_TYPES, type MapElement } from "@vtt/shared";
import type { ElementTool } from "../types";
import styles from "../Battlefield.module.css";

interface Props {
  tool: ElementTool;
  onTool: (tool: ElementTool) => void;
  selected: MapElement | undefined;
  onChange: (element: MapElement) => void;
  onDelete: (id: string) => void;
}

export function ElementsPanel({ tool, onTool, selected, onChange, onDelete }: Props) {
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
        </div>
        {tool !== "select" && <p className={styles.callout}>Trascina sulla mappa per disegnare: {ELEMENT_LABELS[tool].toLowerCase()}.</p>}
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
    </>
  );
}
