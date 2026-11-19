import { useState } from "react";
import { topRightCell } from "../features/battlefield/geometry";
import { AddNpcDialog } from "../features/initiative/AddNpcDialog";
import { CombatantRow } from "../features/initiative/CombatantRow";
import { useInitiative } from "../features/initiative/useInitiative";
import styles from "../features/initiative/Initiative.module.css";
import { createNpcEntries, placeTokens } from "../store/actions";
import { sizeOfRef } from "../store/entities";
import { useSceneStore } from "../store/sceneStore";

export function InitiativePage() {
  const { combat, rows, current, missingPcs, actions } = useInitiative();
  const [npcDialog, setNpcDialog] = useState(false);
  const unrolled = combat.combatants.some((c) => c.roll === null);
  const allActed = combat.active && !current;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Iniziativa</h1>
        <div className="row">
          <button onClick={actions.addParty} disabled={missingPcs.length === 0}>
            + Aggiungi party
          </button>
          <button onClick={() => setNpcDialog(true)}>+ Aggiungi PNG</button>
          <button onClick={actions.rollAll} disabled={!unrolled}>
            🎲 Tira tutti
          </button>
        </div>
      </div>

      <section className={styles.bar} aria-label="Stato del combattimento">
        <div className={styles.round}>
          <span>Round</span>
          <strong data-testid="round">{combat.active ? combat.round : "—"}</strong>
        </div>
        <div className={styles.turnInfo}>
          {!combat.active && <span className="muted">Combattimento non iniziato. Tira l'iniziativa e premi “Inizia”.</span>}
          {combat.active && current && (
            <span>
              Turno di <strong style={{ color: current.entity.color }}>{current.entity.name}</strong>
            </span>
          )}
          {allActed && <span className="muted">Hanno agito tutti: “Turno successivo” apre il round {combat.round + 1}.</span>}
        </div>
        {!combat.active ? (
          <button className="primary" onClick={actions.start} disabled={rows.length === 0}>
            ⚔ Inizia combattimento
          </button>
        ) : (
          <div className="row">
            <button className="primary" onClick={actions.next}>
              Turno successivo ▶
            </button>
            <button
              onClick={() => {
                if (confirm("Terminare il combattimento? I tiri verranno azzerati.")) actions.end();
              }}
            >
              Termina
            </button>
          </div>
        )}
      </section>

      {rows.length === 0 ? (
        <p className="empty">Nessun combattente. Aggiungi il party o dei PNG.</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th title="Ha agito">✓</th>
                <th>Nome</th>
                <th>d20</th>
                <th style={{ textAlign: "center" }}>Mod</th>
                <th style={{ textAlign: "center" }}>Totale</th>
                <th style={{ textAlign: "center" }}>CA</th>
                <th>PF</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <CombatantRow
                  key={row.combatant.id}
                  row={row}
                  active={combat.active}
                  onSetRoll={actions.setRoll}
                  onSetNotes={actions.setNotes}
                  onToggleActed={actions.toggleActed}
                  onMove={actions.move}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {npcDialog && (
        <AddNpcDialog
          showPlaceOption
          onClose={() => setNpcDialog(false)}
          onSubmit={({ entries, placeOnMap }) => {
            const refs = createNpcEntries(entries);
            const { activeId, scenes } = useSceneStore.getState();
            const scene = scenes.find((s) => s.id === activeId);
            // i nuovi PNG partono dall'angolo in alto a destra del contenuto della scena
            if (placeOnMap && scene) placeTokens(scene.id, refs, topRightCell(scene, sizeOfRef), sizeOfRef);
            setNpcDialog(false);
          }}
        />
      )}
    </div>
  );
}
