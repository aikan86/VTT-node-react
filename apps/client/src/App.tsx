import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router";
import { BattlefieldPage } from "./pages/BattlefieldPage";
import { DmRollsPage } from "./pages/DmRollsPage";
import { InitiativePage } from "./pages/InitiativePage";
import { PartyPage } from "./pages/PartyPage";
import { CombatStatus } from "./features/initiative/CombatStatus";
import { flushCombat, useCombatStore } from "./store/combatStore";
import { useDmRollStore } from "./store/dmRollStore";
import { flushParty, usePartyStore } from "./store/partyStore";
import { flushScenes, useSceneStore } from "./store/sceneStore";
import { useStatusStore } from "./store/statusStore";
import styles from "./App.module.css";

// Caricamento iniziale condiviso: la StrictMode esegue gli effetti due volte e due `load()` concorrenti
// creerebbero ciascuno una scena di default.
let bootPromise: Promise<unknown> | null = null;
const boot = () =>
  (bootPromise ??= Promise.all([
    usePartyStore.getState().load(),
    useCombatStore.getState().load(),
    useSceneStore.getState().load(),
    useDmRollStore.getState().load(),
  ]).catch((err: unknown) => {
    bootPromise = null;
    throw err;
  }));

export function App() {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const error = useStatusStore((s) => s.error);
  const dismiss = useStatusStore((s) => s.dismiss);
  const saving = useStatusStore((s) => s.pending > 0);

  useEffect(() => {
    boot()
      .then(() => setState("ready"))
      .catch((err: unknown) => {
        useStatusStore.getState().report(err);
        setState("failed");
      });

    const flush = () => {
      flushParty();
      flushCombat();
      flushScenes();
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>🎲 VTT</span>
        <nav className={styles.nav}>
          <NavLink to="/mappa">Campo di battaglia</NavLink>
          <NavLink to="/party">Party</NavLink>
          <NavLink to="/iniziativa">Iniziativa</NavLink>
          <NavLink to="/tiri-dm">Tiri DM</NavLink>
        </nav>
        <div className={styles.status}>
          {state === "ready" && <CombatStatus />}
          <span aria-live="polite">{saving ? "Salvataggio…" : ""}</span>
        </div>
      </header>
      {error ? (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button onClick={dismiss}>Chiudi</button>
        </div>
      ) : (
        <div />
      )}
      <main className={styles.main}>
        {state === "loading" && <div className={styles.center}>Caricamento…</div>}
        {state === "failed" && <div className={styles.center}>Impossibile contattare il server. È avviato?</div>}
        {state === "ready" && (
          <Routes>
            <Route path="/" element={<Navigate to="/mappa" replace />} />
            <Route path="/mappa" element={<BattlefieldPage />} />
            <Route path="/party" element={<PartyPage />} />
            <Route path="/iniziativa" element={<InitiativePage />} />
            <Route path="/tiri-dm" element={<DmRollsPage />} />
            <Route path="*" element={<Navigate to="/mappa" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
