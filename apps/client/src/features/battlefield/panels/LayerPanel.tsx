import { LAYER_KEYS, LAYER_LABELS, type LayerKey, type Scene } from "@vtt/shared";
import styles from "../Battlefield.module.css";

interface Props {
  scene: Scene;
  active: LayerKey;
  onActivate: (layer: LayerKey) => void;
  onChange: (layer: LayerKey, patch: Partial<Scene["layers"][LayerKey]>) => void;
}

/** I livelli sono elencati dall'alto (effetti) al basso (sfondo), come vengono disegnati. */
export function LayerPanel({ scene, active, onActivate, onChange }: Props) {
  return (
    <section className={styles.section} aria-label="Livelli">
      <h3>Livelli</h3>
      {[...LAYER_KEYS].reverse().map((key) => {
        const state = scene.layers[key];
        return (
          <div key={key} className={styles.layerRow}>
            <button
              className={`${styles.layerName} ${active === key ? styles.activeLayer : ""}`}
              aria-pressed={active === key}
              onClick={() => onActivate(key)}
            >
              {LAYER_LABELS[key]}
            </button>
            <button
              className="icon"
              title={state.visible ? "Nascondi" : "Mostra"}
              aria-label={`${state.visible ? "Nascondi" : "Mostra"} livello ${LAYER_LABELS[key]}`}
              onClick={() => onChange(key, { visible: !state.visible })}
              style={{ opacity: state.visible ? 1 : 0.4 }}
            >
              👁
            </button>
            <button
              className={`icon ${state.locked ? "active" : ""}`}
              title={state.locked ? "Sblocca" : "Blocca"}
              aria-label={`${state.locked ? "Sblocca" : "Blocca"} livello ${LAYER_LABELS[key]}`}
              onClick={() => onChange(key, { locked: !state.locked })}
            >
              {state.locked ? "🔒" : "🔓"}
            </button>
          </div>
        );
      })}
    </section>
  );
}
