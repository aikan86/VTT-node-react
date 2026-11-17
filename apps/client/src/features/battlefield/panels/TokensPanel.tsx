import { DEFAULT_SPEED_FT, formatMove, groupSummary, srdIndexFor, modLookupFrom, sameRef, sortCombatants, type NpcGroup, type Ref, type Scene, type Token } from "@vtt/shared";
import { useLibraryStore } from "../../../store/libraryStore";
import { ConditionIcons, ConditionPicker } from "../../../components/Conditions";
import { EyeIcon } from "../../../components/EyeIcon";
import { HpEditor } from "../../../components/HpEditor";
import { NumberInput } from "../../../components/NumberInput";
import { useCombatStore } from "../../../store/combatStore";
import type { EntityResolver } from "../../../store/entities";
import { setEntityConditions, setEntityHp, setEntityImage } from "../../../store/actions";
import { TokenImagePicker } from "../../../components/TokenImagePicker";
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
  /** Mostra sulla mappa il raggio di movimento del token selezionato. */
  showMovement: boolean;
  onShowMovement: (show: boolean) => void;
  /** Permette o vieta ai giocatori di spostare i PG dalla vista giocatori. */
  onPlayersMoveParty: (allowed: boolean) => void;
  /** Crea i PNG del gruppo (nell'iniziativa) e li prepara da piazzare con un clic sulla mappa. */
  onPlaceGroup: (group: NpcGroup) => void;
}

export function TokensPanel({ scene, resolve, pending, onPending, onAddNpc, selected, onChangeToken, onRemoveToken, onRemoveFromMap, onAddToInitiative, onSetHidden, onSetNpcsHidden, placeHidden, onPlaceHidden, showMovement, onShowMovement, onPlayersMoveParty, onPlaceGroup }: Props) {
  const characters = usePartyStore((s) => s.characters);
  const groups = useLibraryStore((s) => s.npcGroups);
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
  const speedFt = selected?.speedFt ?? DEFAULT_SPEED_FT;

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
                <span className={styles.entityName} data-testid="entity-name" title={e.name}>
                  {e.name}
                </span>
                <ConditionIcons conditions={e.conditions} max={3} />
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
        {groups.length > 0 && (
          <div className={styles.groups}>
            <h4>Gruppi di PNG</h4>
            <ul className={styles.list} aria-label="Gruppi di PNG">
              {groups.map((g) => (
                <li key={g.id}>
                  <span title={groupSummary(g)}>
                    <span className={styles.entityName}>{g.name}</span>
                    <span className="muted" style={{ fontSize: "0.8rem" }}>
                      {g.members.reduce((n, m) => n + m.quantity, 0)} PNG
                    </span>
                  </span>
                  <span>
                    <button disabled={locked} onClick={() => onPlaceGroup(g)} aria-label={`Piazza il gruppo ${g.name}`} title={`${groupSummary(g)}: entrano nell'iniziativa, poi clicca sulla mappa`}>
                      Piazza
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {missingPcs.length > 1 &&<button onClick={() => onPending(missingPcs)}>Piazza tutto il party</button>}
        {missingNpcs.length > 1 && <button onClick={() => onPending(missingNpcs)}>Piazza tutti i PNG</button>}
        <label className="row" style={{ flexWrap: "nowrap" }}>
          <input type="checkbox" checked={scene.playersMoveParty} onChange={(e) => onPlayersMoveParty(e.target.checked)} />
          I giocatori possono muovere i PG dalla loro vista
        </label>
        {scene.playersMoveParty && (
          <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
            In combattimento solo il PG di turno; ogni spostamento va confermato dal giocatore.
          </p>
        )}
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
          <TokenImagePicker
            name={entity.name}
            imageUrl={entity.imageUrl}
            onChange={(url) => setEntityImage(entity.ref, url)}
            srdIndex={entity.ref.kind === "npc" ? srdIndexFor({ name: entity.name }) : null}
          />
          <label className="row" style={{ flexWrap: "nowrap" }}>
            <input type="checkbox" checked={!selected.hidden} disabled={locked} onChange={(e) => onChangeToken({ ...selected, hidden: !e.target.checked })} />
            Visibile ai giocatori (H)
          </label>
          {entity.ref.kind === "pc" && (
            <label className="field">
              Scurovisione (ft)
              <NumberInput
                value={selected.darkvisionFt ?? 0}
                min={0}
                max={1000}
                disabled={locked}
                onChange={(v) => onChangeToken({ ...selected, darkvisionFt: v ? v : undefined })}
              />
            </label>
          )}
          <label className="field">
            Velocità (ft)
            <NumberInput
              value={selected.speedFt ?? DEFAULT_SPEED_FT}
              min={0}
              max={1000}
              disabled={locked}
              onChange={(v) => onChangeToken({ ...selected, speedFt: v === null || v === DEFAULT_SPEED_FT ? undefined : v })}
            />
          </label>
          <span className="muted" style={{ fontSize: "0.8rem", marginTop: "-0.4rem" }} data-testid="speed-summary">
            {formatMove(speedFt, scene.grid.feetPerCell)}
          </span>
          <label className="row" style={{ flexWrap: "nowrap" }}>
            <input type="checkbox" checked={showMovement} onChange={(e) => onShowMovement(e.target.checked)} />
            Mostra raggio di movimento
          </label>
          {showMovement && (
            <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
              Azzurro: caselle raggiungibili con {formatMove(speedFt, scene.grid.feetPerCell)}; più chiaro: con un movimento doppio ({formatMove(speedFt * 2, scene.grid.feetPerCell)}). Le diagonali costano 5 e 10 ft alternati, il terreno difficile il doppio; muri, ostacoli e porte chiuse
              non si attraversano.
            </p>
          )}
          <div className="field">
            Condizioni
            <ConditionPicker name={entity.name} conditions={entity.conditions} onChange={(list) => setEntityConditions(entity.ref, list)} />
          </div>
          {!inInitiative && <button onClick={() => onAddToInitiative(entity.ref)}>Aggiungi all'iniziativa</button>}
          <button className="danger" onClick={() => onRemoveToken(selected.id)}>
            Rimuovi dalla mappa
          </button>
        </section>
      )}
    </>
  );
}
