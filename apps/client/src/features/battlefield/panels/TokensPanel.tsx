import { modLookupFrom, sameRef, sortCombatants, type Ref, type Scene, type Token } from "@vtt/shared";
import { EyeIcon } from "../../../components/EyeIcon";
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
  onChangeToken: (token: Token) => void;
  onRemoveToken: (id: string) => void;
  /** Toglie i token dell'entità dalla scena attiva (l'entità resta in party/iniziativa). */
  onRemoveFromMap: (ref: Ref) => void;
  onAddToInitiative: (ref: Ref) => void;
  /** Nasconde/mostra ai giocatori tutti i token dell'entità sulla scena. */
  onSetHidden: (ref: Ref, hidden: boolean) => void;
  /** Nasconde/mostra ai giocatori tutti i PNG sulla scena. */
  onSetNpcsHidden: (hidden: boolean) => void;
  /** I token che si stanno per piazzare nascono nascosti ai giocatori. */
  placeHidden: boolean;
  onPlaceHidden: (hidden: boolean) => void;
}

export function TokensPanel({ scene, resolve, pending, onPending, onAddNpc, selected, onChangeToken, onRemoveToken, onRemoveFromMap, onAddToInitiative, onSetHidden, onSetNpcsHidden, placeHidden, onPlaceHidden }: Props) {
  const characters = usePartyStore((s) => s.characters);
  const combat = useCombatStore((s) => s.combat);
  const locked = scene.layers.tokens.locked;
  const onMap = (ref: Ref) => scene.tokens.some((t) => sameRef(t.ref, ref));
  /** Sulla mappa ma nascosto ai giocatori (tutti i suoi token lo sono). */
  const hiddenOnMap = (ref: Ref) => scene.tokens.filter((t) => sameRef(t.ref, ref)).every((t) => t.hidden);

  const pcRefs: Ref[] = characters.map((c) => ({ kind: "pc", id: c.id }));
  const npcRefs: Ref[] = combat.npcs.map((n) => ({ kind: "npc", id: n.id }));
  // stesso ordine del tracker di iniziativa; chi non è nell'iniziativa va in fondo (prima i PG, poi i PNG)
  const inInitiativeOrder = sortCombatants(combat.combatants, modLookupFrom(characters, combat.npcs)).map((c) => c.ref);
  const allRefs = [
    ...inInitiativeOrder,
    ...[...pcRefs, ...npcRefs].filter((r) => !inInitiativeOrder.some((o) => sameRef(o, r))),
  ];
  const currentRef = combat.active ? combat.combatants.find((c) => c.id === combat.currentId)?.ref : undefined;
  const missingPcs = pcRefs.filter((r) => !onMap(r));
  const missingNpcs = npcRefs.filter((r) => !onMap(r));
  const placedNpcs = npcRefs.filter(onMap);
  const anyNpcVisible = placedNpcs.some((r) => !hiddenOnMap(r));
  const anyNpcHidden = placedNpcs.some((r) => hiddenOnMap(r));
  const entity = selected && resolve(selected.ref);
  const inInitiative = selected && combat.combatants.some((c) => sameRef(c.ref, selected.ref));

  const list = (refs: Ref[], empty: string) =>
    refs.length === 0 ? (
      <span className="muted" style={{ fontSize: "0.85rem" }}>
        {empty}
      </span>
    ) : (
      <ul className={styles.list} aria-label="Personaggi">
        {refs.map((ref) => {
          const e = resolve(ref);
          if (!e) return null;
          const placed = onMap(ref);
          const current = currentRef !== undefined && sameRef(currentRef, ref);
          return (
            <li key={ref.id} className={current ? styles.current : undefined} aria-current={current ? "step" : undefined}>
              <span>
                <span className="swatch" style={{ background: e.color }} />
                <span data-testid="entity-name">{e.name}</span>
                {ref.kind === "npc" && <span className="badge">PNG</span>}
                {placed && hiddenOnMap(ref) && (
                  <span className="badge" title="Nascosto ai giocatori">
                    nascosto
                  </span>
                )}
                {current && <span className={styles.turn}>◀ turno</span>}
              </span>
              <span className="row" style={{ flexWrap: "nowrap", gap: "0.3rem" }}>
                {placed && (
                  <button
                    aria-pressed={hiddenOnMap(ref)}
                    aria-label={hiddenOnMap(ref) ? `Mostra ${e.name} ai giocatori` : `Nascondi ${e.name} ai giocatori`}
                    title={hiddenOnMap(ref) ? "Nascosto ai giocatori: clicca per mostrarlo" : "Visibile ai giocatori: clicca per nasconderlo"}
                    disabled={locked}
                    onClick={() => onSetHidden(ref, !hiddenOnMap(ref))}
                  >
                    <EyeIcon off={hiddenOnMap(ref)} />
                  </button>
                )}
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
              </span>
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
      {pending && (
        <label className="row" style={{ flexWrap: "nowrap" }}>
          <input type="checkbox" checked={placeHidden} onChange={(e) => onPlaceHidden(e.target.checked)} />
          Piazza nascosti ai giocatori
        </label>
      )}

      <section className={styles.section}>
        <h3>Personaggi</h3>
        <button className="primary" onClick={onAddNpc}>
          + Aggiungi PNG
        </button>
        {list(allRefs, "Nessun personaggio: crea i PG nella pagina Party o aggiungi un PNG.")}
        {missingPcs.length > 1 && <button onClick={() => onPending(missingPcs)}>Piazza tutto il party</button>}
        {missingNpcs.length > 1 && <button onClick={() => onPending(missingNpcs)}>Piazza tutti i PNG</button>}
        {anyNpcVisible && (
          <button disabled={locked} onClick={() => onSetNpcsHidden(true)}>
            Nascondi tutti i PNG ai giocatori
          </button>
        )}
        {anyNpcHidden && (
          <button disabled={locked} onClick={() => onSetNpcsHidden(false)}>
            Mostra tutti i PNG ai giocatori
          </button>
        )}
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
          <label className="row" style={{ flexWrap: "nowrap" }}>
            <input type="checkbox" checked={!selected.hidden} disabled={locked} onChange={(e) => onChangeToken({ ...selected, hidden: !e.target.checked })} />
            Visibile ai giocatori (H)
          </label>
          {!inInitiative && <button onClick={() => onAddToInitiative(entity.ref)}>Aggiungi all'iniziativa</button>}
          <button className="danger" onClick={() => onRemoveToken(selected.id)}>
            Rimuovi dalla mappa
          </button>
        </section>
      )}
    </>
  );
}
