import type { PlayerViewSettings } from "@vtt/shared";
import { useSettingsStore } from "../store/settingsStore";
import styles from "./Settings.module.css";

const PLAYER_VIEW_OPTIONS: { key: keyof PlayerViewSettings; label: string; hint: string }[] = [
  { key: "showInitiative", label: "Mostra l'iniziativa", hint: "L'ordine di iniziativa sullo schermo condiviso e sui telefoni dei giocatori." },
  { key: "showNpcHp", label: "Mostra la vita dei PNG", hint: "La barra dei punti ferita sui token dei PNG." },
  { key: "showPartyHp", label: "Mostra la vita del party", hint: "La barra dei punti ferita sui token dei PG (ognuno vede comunque i propri PF sul telefono)." },
];

/** Impostazioni del master: per ora, cosa vedono i giocatori nelle loro viste. */
export function SettingsPage() {
  const playerView = useSettingsStore((s) => s.settings.playerView);
  const setPlayerView = useSettingsStore((s) => s.setPlayerView);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Impostazioni</h1>
      </div>
      <fieldset className={styles.card}>
        <legend>Vista giocatori</legend>
        <p className={`muted ${styles.intro}`}>Cosa compare nella pagina dei giocatori (schermo condiviso e telefono). Le modifiche si applicano subito.</p>
        {PLAYER_VIEW_OPTIONS.map(({ key, label, hint }) => (
          <label key={key} className={styles.toggle}>
            <input type="checkbox" checked={playerView[key]} onChange={(e) => setPlayerView({ [key]: e.target.checked })} />
            <span>{label}</span>
            <small>{hint}</small>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
