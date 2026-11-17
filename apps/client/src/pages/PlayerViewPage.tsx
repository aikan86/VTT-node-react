import { useEffect, useState } from "react";
import { getTotal, modLookupFrom, playerCombatants, sameRef, type Combat, type Scene } from "@vtt/shared";
import { ConditionIcons } from "../components/Conditions";
import { PlayerStage } from "../features/battlefield/PlayerStage";
import { useCombatStore } from "../store/combatStore";
import { useEntityResolver } from "../store/entities";
import { usePartyStore } from "../store/partyStore";
import { useSceneStore } from "../store/sceneStore";
import { useStatusStore } from "../store/statusStore";
import styles from "./PlayerView.module.css";

function useFullscreen() {
  const [full, setFull] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  return { full, toggle };
}

function InitiativeOrder({ combat, scene }: { combat: Combat; scene: Scene }) {
  const characters = usePartyStore((s) => s.characters);
  const resolve = useEntityResolver();
  const getMod = modLookupFrom(characters, combat.npcs);
  const list = playerCombatants(combat, scene, getMod);
  if (!combat.active || list.length === 0) return null;

  return (
    <aside className={styles.order} aria-label="Iniziativa">
      <h2>
        <span>Iniziativa</span>
        <span>Round {combat.round}</span>
      </h2>
      <ol>
        {list.map((c, i) => {
          const entity = resolve(c.ref);
          if (!entity) return null;
          const total = getTotal(c, getMod);
          const current = c.id === combat.currentId;
          return (
            <li key={c.id} className={current ? styles.current : undefined} aria-current={current ? "step" : undefined}>
              <span className={styles.rank}>{i + 1}</span>
              <span className="swatch" style={{ background: entity.color }} />
              <span className={styles.name}>{entity.name}</span>
              {/* sempre presente: tiene allineata la colonna dei totali */}
              <span>
                <ConditionIcons conditions={entity.conditions} />
              </span>
              <span className={styles.total}>{total ?? "–"}</span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** Pagina a schermo intero per i giocatori: la scena "in onda" scelta dal master e l'ordine di iniziativa. */
export function PlayerViewPage() {
  const scene = useSceneStore((s) => s.scenes.find((sc) => sc.shownToPlayers));
  const combat = useCombatStore((s) => s.combat);
  const resolve = useEntityResolver();
  const live = useStatusStore((s) => s.live);
  const { full, toggle } = useFullscreen();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = combat.active ? combat.combatants.find((c) => c.id === combat.currentId) : undefined;

  return (
    <div className={styles.root}>
      {scene ? (
        <>
          <PlayerStage scene={scene} resolve={resolve} currentRef={current && scene.tokens.some((t) => sameRef(t.ref, current.ref) && !t.hidden) ? current.ref : null} />
          <InitiativeOrder combat={combat} scene={scene} />
        </>
      ) : (
        <div className={styles.waiting}>
          <h1>In attesa del master…</h1>
          <p>La mappa comparirà qui appena il master la mostrerà ai giocatori.</p>
        </div>
      )}
      <button className={styles.fs} onClick={toggle} aria-label={full ? "Esci dallo schermo intero" : "Schermo intero"}>
        {full ? "Esci da schermo intero (F)" : "⛶ Schermo intero (F)"}
      </button>
      {live === false && <span className={styles.offline}>● Non connesso: la mappa non si aggiorna</span>}
    </div>
  );
}
