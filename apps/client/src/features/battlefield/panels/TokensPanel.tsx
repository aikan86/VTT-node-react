import { sameRef, type Ref, type Scene, type Token } from "@vtt/shared";
import { HpEditor } from "../../../components/HpEditor";
import { useCombatStore } from "../../../store/combatStore";
import type { EntityResolver } from "../../../store/entities";
import { setEntityHp } from "../../../store/actions";
import { usePartyStore } from "../../../store/partyStore";
import type { PendingPlacement } from "../types";
import styles from "../Battlefield.module.css";

interface Props {
  scene: Scene;
  resolve: EntityResolver;
  pending: PendingPlacement;
  onPending: (refs: PendingPlacement) => void;
  onAddNpc: () => void;
  selected: Token | undefined;
  onRemoveToken: (id: string) => void;
  /** Toglie i token dell'entità dalla scena attiva (l'entità resta in party/iniziativa). */
  onRemoveFromMap: (ref: Ref) => void;
  onAddToInitiative: (ref: Ref) => void;
}

export function TokensPanel({ scene, resolve, pending, onPending, onAddNpc, selected, onRemoveToken, onRemoveFromMap, onAddToInitiative }: Props) {
  const characters = usePartyStore((s) => s.characters);
  const combat = useCombatStore((s) => s.combat);
  const locked = scene.layers.tokens.locked;
  const onMap = (ref: Ref) => scene.tokens.some((t) => sameRef(t.ref, ref));

  const pcRefs: Ref[] = characters.map((c) => ({ kind: "pc", id: c.id }));
  const npcRefs: Ref[] = combat.npcs.map((n) => ({ kind: "npc", id: n.id }));
  const missingPcs = pcRefs.filter((r) => !onMap(r));
  const missingNpcs = npcRefs.filter((r) => !onMap(r));
  const entity = selected && resolve(selected.ref);
  const inInitiative = selected && combat.combatants.some((c) => sameRef(c.ref, selected.ref));

  const list = (refs: Ref[], empty: string) =>
    refs.length === 0 ? (
      <span className="muted" style={{ fontSize: "0.85rem" }}>
        {empty}
      </span>
    ) : (
      <ul className={styles.list}>
        {refs.map((ref) => {
          const e = resolve(ref);
          if (!e) return null;
          const placed = onMap(ref);
          return (
            <li key={ref.id}>
              <span>
                <span className="swatch" style={{ background: e.color }} />
                {e.name}
              </span>
              {placed ? (
                <button
                  className={styles.onMap}
                  onClick={() => onRemoveFromMap(ref)}
                  disabled={locked}
                  title={locked ? "Livello bloccato" : "Rimuovi dalla mappa"}
                  aria-label={`Rimuovi ${e.name} dalla mappa`}
                >
                  <span className={styles.onMapLabel}>sulla mappa</span>
                  <span className={styles.onMapAction} aria-hidden="true">
                    ✕ Rimuovi
                  </span>
                </button>
              ) : (
                <button onClick={() => onPending([ref])}>Piazza</button>
              )}
            </li>
          );
        })}
      </ul>
    );

  return (
    <>
      {pending && (
        <p className={styles.callout} role="status">
          Clicca sulla mappa per piazzare {pending.length === 1 ? "il token" : `${pending.length} token`}. <kbd>Esc</kbd> per annullare.
        </p>
      )}

      <section className={styles.section}>
        <h3>Party</h3>
        {list(pcRefs, "Nessun PG: creali nella pagina Party.")}
        {missingPcs.length > 1 && <button onClick={() => onPending(missingPcs)}>Piazza tutto il party</button>}
      </section>

      <section className={styles.section}>
        <h3>PNG</h3>
        <button className="primary" onClick={onAddNpc}>
          + Aggiungi PNG
        </button>
        {list(npcRefs, "Nessun PNG nel combattimento.")}
        {missingNpcs.length > 1 && <button onClick={() => onPending(missingNpcs)}>Piazza tutti i PNG</button>}
      </section>

      {selected && entity && (
        <section className={styles.selected} aria-label="Token selezionato">
          <div className="row">
            <span className="swatch" style={{ background: entity.color }} />
            <strong>{entity.name}</strong>
            <span className="badge">{entity.ref.kind === "pc" ? "PG" : "PNG"}</span>
            <span className="muted" style={{ marginLeft: "auto" }}>
              CA {entity.ac}
            </span>
          </div>
          <HpEditor hp={entity.hp} label={entity.name} onChange={(hp) => setEntityHp(entity.ref, hp)} />
          {!inInitiative && <button onClick={() => onAddToInitiative(entity.ref)}>Aggiungi all'iniziativa</button>}
          <button className="danger" onClick={() => onRemoveToken(selected.id)}>
            Rimuovi dalla mappa
          </button>
        </section>
      )}
    </>
  );
}
