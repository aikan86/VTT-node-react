import { currentHandout, getTotal, modLookupFrom, movePartyToken, ownMover, partyMover, playerCombatants, sameRef, type Ref } from "@vtt/shared";
import { ConditionIcons } from "../components/Conditions";
import { PlayerStage } from "../features/battlefield/PlayerStage";
import { useCombatStore } from "../store/combatStore";
import { useEntityResolver } from "../store/entities";
import { useLibraryStore } from "../store/libraryStore";
import { usePartyStore } from "../store/partyStore";
import { useSceneStore } from "../store/sceneStore";
import { useSettingsStore } from "../store/settingsStore";
import { useStatusStore } from "../store/statusStore";
import styles from "./PlayerPhone.module.css";
import viewStyles from "./PlayerView.module.css";

/**
 * Vista del singolo giocatore (/giocatori/:pgId), pensata per il telefono: il proprio PG in alto (PF, CA, condizioni),
 * la mappa centrata su di lui e vista con i suoi occhi, il turno e l'iniziativa a scomparsa.
 */
export function PlayerPhonePage({ pcId }: { pcId: string }) {
  const character = usePartyStore((s) => s.characters.find((c) => c.id === pcId));
  const scene = useSceneStore((s) => s.scenes.find((sc) => sc.shownToPlayers));
  const combat = useCombatStore((s) => s.combat);
  const characters = usePartyStore((s) => s.characters);
  const handout = useLibraryStore((s) => currentHandout(s.handouts));
  const live = useStatusStore((s) => s.live);
  const resolve = useEntityResolver();
  const showInitiative = useSettingsStore((s) => s.settings.playerView.showInitiative);

  if (!character) {
    return (
      <div className={styles.root}>
        <div className={styles.message}>
          <h1>Personaggio non trovato</h1>
          <p>Il link non corrisponde a nessun personaggio del party: chiedi al master quello giusto.</p>
        </div>
      </div>
    );
  }

  const me: Ref = { kind: "pc", id: character.id };
  const self = resolve(me);
  const getMod = modLookupFrom(characters, combat.npcs);
  // l'ordine di iniziativa si vede solo se il master lo permette nelle impostazioni
  const order = scene && showInitiative ? playerCombatants(combat, scene, getMod) : [];
  const current = combat.active ? combat.combatants.find((c) => c.id === combat.currentId) : undefined;
  const myTurn = !!current && sameRef(current.ref, me);
  const currentName = current ? resolve(current.ref)?.name : undefined;
  const onMap = !!scene?.tokens.some((t) => sameRef(t.ref, me) && !t.hidden);
  const myPlace = order.findIndex((c) => sameRef(c.ref, me));
  const hp = character.hp;
  const ratio = hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : 0;

  return (
    <div className={styles.root}>
      <header className={styles.header} style={{ borderBottomColor: character.color }}>
        <span className={styles.who}>
          <span className="swatch" style={{ background: character.color }} />
          <strong>{character.name}</strong>
          <ConditionIcons conditions={self?.conditions ?? []} />
        </span>
        <span className={styles.stats}>
          <span className={styles.hp} aria-label={`Punti ferita ${hp.current} su ${hp.max}${hp.temp ? `, ${hp.temp} temporanei` : ""}`}>
            <span className={styles.hpBar}>
              <span style={{ width: `${ratio * 100}%`, background: ratio > 0.5 ? "#22c55e" : ratio > 0.25 ? "#eab308" : "#ef4444" }} />
            </span>
            PF {hp.current}/{hp.max}
            {hp.temp > 0 && <span className="muted"> +{hp.temp}</span>}
          </span>
          <span>CA {character.ac}</span>
        </span>
      </header>

      {combat.active && (
        <div className={myTurn ? `${styles.turn} ${styles.myTurn}` : styles.turn} role="status">
          {myTurn ? "🎯 Tocca a te! Trascina il tuo segnalino e conferma." : `Round ${combat.round} · turno di ${currentName ?? "…"}${myPlace >= 0 ? ` · tu sei ${myPlace + 1}°` : ""}`}
        </div>
      )}

      <main className={styles.map}>
        {scene ? (
          <>
            <PlayerStage
              scene={scene}
              resolve={resolve}
              currentRef={current && scene.tokens.some((t) => sameRef(t.ref, current.ref) && !t.hidden) ? current.ref : null}
              mover={ownMover(partyMover(combat), me)}
              viewer={me}
              focus={me}
              onMoveToken={(token) =>
                useSceneStore.getState().update(scene.id, (s) => movePartyToken(s, token.id, token, ownMover(partyMover(useCombatStore.getState().combat), me)))
              }
            />
            {!onMap && <p className={styles.notice}>Il tuo personaggio non è sulla mappa: aspetta che il master lo piazzi.</p>}
          </>
        ) : (
          <div className={styles.message}>
            <h1>In attesa del master…</h1>
            <p>La mappa comparirà qui appena il master la mostrerà ai giocatori.</p>
          </div>
        )}
      </main>

      {combat.active && order.length > 0 && (
        <details className={styles.order}>
          <summary>Iniziativa · round {combat.round}</summary>
          <ol>
            {order.map((c) => {
              const entity = resolve(c.ref);
              if (!entity) return null;
              const isCurrent = c.id === combat.currentId;
              return (
                <li key={c.id} className={isCurrent ? styles.current : undefined} aria-current={isCurrent ? "step" : undefined}>
                  <span className="swatch" style={{ background: entity.color }} />
                  <span className={styles.name}>
                    {entity.name}
                    {sameRef(c.ref, me) && " (tu)"}
                  </span>
                  <ConditionIcons conditions={entity.conditions} max={3} />
                  <span className="muted">{getTotal(c, getMod) ?? "–"}</span>
                </li>
              );
            })}
          </ol>
        </details>
      )}

      {handout && (
        <figure className={viewStyles.handout} aria-label={`Handout: ${handout.title}`}>
          <figcaption>{handout.title}</figcaption>
          <img src={handout.imageUrl} alt={handout.title} />
        </figure>
      )}
      {live === false && <span className={styles.offline}>● Non connesso</span>}
    </div>
  );
}
