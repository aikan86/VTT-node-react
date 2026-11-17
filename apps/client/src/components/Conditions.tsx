import { CONDITION_INFO, CONDITIONS, toggleCondition, type Condition } from "@vtt/shared";
import styles from "./Conditions.module.css";

/** Icone delle condizioni in corso; niente se non ce ne sono. */
export function ConditionIcons({ conditions }: { conditions: readonly Condition[] }) {
  if (conditions.length === 0) return null;
  return (
    <span className={styles.icons} data-testid="condition-icons">
      {conditions.map((c) => (
        <span key={c} role="img" aria-label={CONDITION_INFO[c].label} title={CONDITION_INFO[c].label}>
          {CONDITION_INFO[c].icon}
        </span>
      ))}
    </span>
  );
}

interface PickerProps {
  /** Nome di chi subisce le condizioni (per l'accessibilità). */
  name: string;
  conditions: readonly Condition[];
  onChange: (conditions: Condition[]) => void;
}

/** Interruttori per tutte le condizioni. */
export function ConditionPicker({ name, conditions, onChange }: PickerProps) {
  return (
    <div className={styles.picker} role="group" aria-label={`Condizioni di ${name}`}>
      {CONDITIONS.map((c) => {
        const on = conditions.includes(c);
        return (
          <button key={c} type="button" className={on ? styles.on : undefined} aria-pressed={on} onClick={() => onChange(toggleCondition(conditions, c))}>
            <span aria-hidden="true">{CONDITION_INFO[c].icon}</span> {CONDITION_INFO[c].label}
          </button>
        );
      })}
    </div>
  );
}
