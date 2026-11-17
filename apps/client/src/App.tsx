import { useEffect, useState } from "react";
import { COLLECTIONS, type Character, type DmRoll, type Handout, type Monster, type NpcGroup, type Scene } from "@vtt/shared";
import { connectLive } from "./api/live";
import { Navigate, NavLink, Route, Routes, useMatch } from "react-router";
import { BattlefieldPage } from "./pages/BattlefieldPage";
import { DmRollsPage } from "./pages/DmRollsPage";
import { InitiativePage } from "./pages/InitiativePage";
import { PartyPage } from "./pages/PartyPage";
import { PlayerViewPage } from "./pages/PlayerViewPage";
import { CombatStatus } from "./features/initiative/CombatStatus";
import { TransferButtons } from "./features/transfer/TransferButtons";
import { flushCombat, receiveCombat, resyncCombat, useCombatStore } from "./store/combatStore";
import { dmRollSync, useDmRollStore } from "./store/dmRollStore";
import { flushLibrary, handoutSync, loadLibrary, monsterSync, npcGroupSync, resyncLibrary } from "./store/libraryStore";
import { HandoutsPage } from "./pages/HandoutsPage";
import { flushParty, partySync, usePartyStore } from "./store/partyStore";
import { flushScenes, sceneSync, useSceneStore } from "./store/sceneStore";
import { reportError, useStatusStore } from "./store/statusStore";
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
    loadLibrary(),
  ]).catch((err: unknown) => {
    bootPromise = null;
    throw err;
  }));

/** Aggiornamenti in tempo reale: le modifiche degli altri tab arrivano subito, senza sovrascritture. */
function startLiveSync(): () => void {
  return connectLive({
    onStatus: (connected) => useStatusStore.getState().setLive(connected),
    onOpen: () => {
      // eventi persi mentre la connessione era giù: riallinea tutto
      Promise.all([partySync.resync(), sceneSync.resync(), dmRollSync.resync(), resyncCombat(), resyncLibrary()]).catch(reportError);
    },
    onChange: (change) => {
      const versioned = { id: change.id, rev: change.rev };
      switch (change.collection) {
        case COLLECTIONS.characters:
          return partySync.receive({ ...versioned, data: change.data as Character | null });
        case COLLECTIONS.scenes:
          return sceneSync.receive({ ...versioned, data: change.data as Scene | null });
        case COLLECTIONS.dmRolls:
          return dmRollSync.receive({ ...versioned, data: change.data as DmRoll | null });
        case COLLECTIONS.combat:
          return receiveCombat(change.rev, change.data);
        case COLLECTIONS.handouts:
          return handoutSync.receive({ ...versioned, data: change.data as Handout | null });
        case COLLECTIONS.monsters:
          return monsterSync.receive({ ...versioned, data: change.data as Monster | null });
        case COLLECTIONS.npcGroups:
          return npcGroupSync.receive({ ...versioned, data: change.data as NpcGroup | null });
      }
    },
  });
}

export function App() {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const error = useStatusStore((s) => s.error);
  const dismiss = useStatusStore((s) => s.dismiss);
  const saving = useStatusStore((s) => s.pending > 0);
  const live = useStatusStore((s) => s.live);

  useEffect(() => {
    let stopLive: (() => void) | null = null;
    let cancelled = false;
    boot()
      .then(() => {
        setState("ready");
        if (!cancelled) stopLive = startLiveSync();
      })
      .catch((err: unknown) => {
        useStatusStore.getState().report(err);
        setState("failed");
      });

    const flush = () => {
      void flushParty();
      void flushCombat();
      void flushScenes();
      void flushLibrary();
    };
    // un tab che passa in background salva subito: chi lo usa dopo parte da dati aggiornati
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      stopLive?.();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Vista giocatori: a schermo intero, senza intestazione né controlli del master (i dati arrivano dagli stessi aggiornamenti in tempo reale)
  const playerRoute = useMatch("/giocatori");
  if (playerRoute) {
    if (state !== "ready") {
      return <div style={{ height: "100%", display: "grid", placeItems: "center" }}>{state === "failed" ? "Impossibile contattare il server. È avviato?" : "Caricamento…"}</div>;
    }
    return <PlayerViewPage />;
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>🎲 VTT</span>
        <nav className={styles.nav}>
          <NavLink to="/mappa">Campo di battaglia</NavLink>
          <NavLink to="/party">Party</NavLink>
          <NavLink to="/iniziativa">Iniziativa</NavLink>
          <NavLink to="/tiri-dm">Tiri DM</NavLink>
          <NavLink to="/handout">Handout</NavLink>
        </nav>
        <div className={styles.status}>
          {state === "ready" && <CombatStatus />}
          <span aria-live="polite">{saving ? "Salvataggio…" : ""}</span>
          {live === false && (
            <span className={styles.offline} title="Le modifiche degli altri tab non arrivano finché la connessione non torna">
              ● Non connesso
            </span>
          )}
          {state === "ready" && <TransferButtons />}
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
            <Route path="/handout" element={<HandoutsPage />} />
            <Route path="*" element={<Navigate to="/mappa" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
