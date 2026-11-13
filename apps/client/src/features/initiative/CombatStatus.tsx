import { useInitiative } from "./useInitiative";

/** Riepilogo compatto del combattimento (barra in alto, visibile da ogni pagina). */
export function CombatStatus() {
  const { combat, current, actions } = useInitiative();
  if (!combat.active) return null;
  return (
    <span className="row" style={{ gap: "0.75rem" }}>
      <span>
        Round <strong style={{ color: "var(--text)" }}>{combat.round}</strong>
      </span>
      <span>
        {current ? (
          <>
            Turno di <strong style={{ color: current.entity.color }}>{current.entity.name}</strong>
          </>
        ) : (
          "Fine round"
        )}
      </span>
      <button className="primary" onClick={actions.next}>
        Turno successivo ▶
      </button>
    </span>
  );
}
