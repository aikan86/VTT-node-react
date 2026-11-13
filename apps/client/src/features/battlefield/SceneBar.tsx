import type { Scene } from "@vtt/shared";
import { useSceneStore } from "../../store/sceneStore";
import { reportError } from "../../store/statusStore";
import styles from "./Battlefield.module.css";

export function SceneBar({ scene }: { scene: Scene }) {
  const scenes = useSceneStore((s) => s.scenes);
  const { select, create, remove, update } = useSceneStore.getState();

  return (
    <div className={styles.sceneBar}>
      <label className="row" style={{ gap: "0.4rem" }}>
        <span className="muted">Scena</span>
        <select value={scene.id} onChange={(e) => select(e.target.value)} aria-label="Scena attiva">
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={() => {
          const name = prompt("Nome della nuova scena", `Scena ${scenes.length + 1}`);
          if (name?.trim()) create(name.trim()).catch(reportError);
        }}
      >
        + Nuova
      </button>
      <button
        onClick={() => {
          const name = prompt("Rinomina scena", scene.name);
          if (name?.trim()) update(scene.id, (s) => ({ ...s, name: name.trim().slice(0, 80) }));
        }}
      >
        Rinomina
      </button>
      <button
        className="danger"
        disabled={scenes.length <= 1}
        onClick={() => {
          if (confirm(`Eliminare la scena “${scene.name}”?`)) remove(scene.id).catch(reportError);
        }}
      >
        Elimina
      </button>
    </div>
  );
}
