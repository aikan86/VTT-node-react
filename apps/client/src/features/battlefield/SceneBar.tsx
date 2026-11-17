import type { Scene } from "@vtt/shared";
import { useSceneStore } from "../../store/sceneStore";
import { reportError } from "../../store/statusStore";
import styles from "./Battlefield.module.css";

export function SceneBar({ scene }: { scene: Scene }) {
  const scenes = useSceneStore((s) => s.scenes);
  const { select, create, remove, update, showToPlayers } = useSceneStore.getState();

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
      <span className="row" style={{ marginLeft: "auto", gap: "0.4rem" }}>
        <button
          className={scene.vision.enabled ? "active" : ""}
          aria-pressed={scene.vision.enabled}
          title={
            scene.vision.enabled
              ? "Nebbia di guerra attiva: i giocatori vedono solo ciò che vede il party. Clicca per mostrare loro tutta la mappa"
              : "Nebbia di guerra spenta: i giocatori vedono tutta la mappa. Clicca per mostrare solo ciò che vede il party"
          }
          onClick={() => update(scene.id, (s) => ({ ...s, vision: { ...s.vision, enabled: !s.vision.enabled } }))}
        >
          🌫 Nebbia di guerra{scene.vision.enabled ? "" : ": spenta"}
        </button>
        <button
          className={scene.shownToPlayers ? "active" : ""}
          aria-pressed={scene.shownToPlayers}
          title={scene.shownToPlayers ? "Smetti di mostrarla: i giocatori tornano in attesa" : "I giocatori vedranno questa scena"}
          onClick={() => showToPlayers(scene.shownToPlayers ? null : scene.id)}
        >
          {scene.shownToPlayers ? "📺 In onda ai giocatori" : "📺 Mostra ai giocatori"}
        </button>
        <button title="Apre la vista a schermo intero per i giocatori (da trascinare sul secondo schermo)" onClick={() => window.open("/giocatori", "vtt-giocatori")}>
          Apri vista giocatori ↗
        </button>
      </span>
    </div>
  );
}
