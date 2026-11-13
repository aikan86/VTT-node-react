import { rollD20 } from "@vtt/shared";
import { HpEditor } from "../../components/HpEditor";
import { NumberInput } from "../../components/NumberInput";
import { removeFromInitiative, setEntityHp } from "../../store/actions";
import type { CombatantRowData } from "./useInitiative";
import styles from "./Initiative.module.css";

interface Props {
  row: CombatantRowData;
  active: boolean;
  onSetRoll: (id: string, roll: number | null) => void;
  onToggleActed: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

export function CombatantRow({ row, active, onSetRoll, onToggleActed, onMove }: Props) {
  const { combatant: c, entity, total, current } = row;
  const className = [styles.row, current && styles.current, c.acted && styles.acted, entity.hp.current <= 0 && styles.down]
    .filter(Boolean)
    .join(" ");

  return (
    <tr className={className} aria-current={current ? "step" : undefined} data-testid="combatant-row">
      <td>
        <input
          type="checkbox"
          checked={c.acted}
          disabled={!active}
          onChange={() => onToggleActed(c.id)}
          aria-label={`${entity.name} ha agito`}
        />
      </td>
      <td>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <span className="swatch" style={{ background: entity.color }} />
          <span className={styles.name}>{entity.name}</span>
          {entity.ref.kind === "npc" && <span className="badge">PNG</span>}
          {current && <span className={styles.turn}>◀ turno</span>}
        </div>
      </td>
      <td>
        <div className="row" style={{ flexWrap: "nowrap", gap: "0.25rem" }}>
          <NumberInput
            value={c.roll}
            onChange={(v) => onSetRoll(c.id, v)}
            min={1}
            max={20}
            allowEmpty
            placeholder="d20"
            aria-label={`d20 di ${entity.name}`}
            style={{ width: "3.4rem", textAlign: "center" }}
          />
          <button className="icon" title="Tira d20" aria-label={`Tira d20 per ${entity.name}`} onClick={() => onSetRoll(c.id, rollD20())}>
            🎲
          </button>
        </div>
      </td>
      <td className={styles.num}>{signed(entity.initiativeMod)}</td>
      <td className={styles.total} data-testid="total">
        {total ?? "—"}
      </td>
      <td className={styles.num}>{entity.ac}</td>
      <td>
        <HpEditor hp={entity.hp} label={entity.name} onChange={(hp) => setEntityHp(entity.ref, hp)} />
      </td>
      <td>
        <div className="row" style={{ flexWrap: "nowrap", gap: "0.25rem" }}>
          <button className="icon" disabled={!row.canMoveUp} onClick={() => onMove(c.id, -1)} title="Sposta su (solo a parità)" aria-label={`Sposta su ${entity.name}`}>
            ↑
          </button>
          <button className="icon" disabled={!row.canMoveDown} onClick={() => onMove(c.id, 1)} title="Sposta giù (solo a parità)" aria-label={`Sposta giù ${entity.name}`}>
            ↓
          </button>
          <button className="icon danger" onClick={() => removeFromInitiative(c.id)} title="Rimuovi dall'iniziativa" aria-label={`Rimuovi ${entity.name}`}>
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}
