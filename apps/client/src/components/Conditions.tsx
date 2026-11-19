import { CONDITION_INFO, CONDITIONS, toggleCondition, type Condition } from "@vtt/shared";
import styles from "./Conditions.module.css";

/** Icone delle condizioni in corso; niente se non ce ne sono. Oltre `max` icone le restanti diventano "+N" (nomi nel suggerimento). */
export function ConditionIcons({ conditions, max = Infinity }: { conditions: readonly Condition[]; max?: number }) {
  if (conditions.length === 0) return null;
  const overflow = conditions.length > max;
  const shown = overflow ? conditions.slice(0, Math.max(0, max - 1)) : conditions;
  const rest = conditions.slice(shown.length);
  return (
    <span className={styles.icons} data-testid="condition-icons">
      {shown.map((c) => (
        <span key={c} role="img" aria-label={CONDITION_INFO[c].label} title={CONDITION_INFO[c].label}>
          {CONDITION_INFO[c].icon}
        </span>
      ))}
      {overflow && (
        <span className={styles.more} title={rest.map((c) => CONDITION_INFO[c].label).join(", ")} aria-label={`e altre ${rest.length}: ${rest.map((c) => CONDITION_INFO[c].label).join(", ")}`}>
          +{rest.length}
        </span>
      )}
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
          <button key={c} type="button" className={on ? `active ${styles.on}` : undefined} aria-pressed={on} onClick={() => onChange(toggleCondition(conditions, c))}>
            <span aria-hidden="true">{CONDITION_INFO[c].icon}</span> {CONDITION_INFO[c].label}
          </button>
        );
      })}
    </div>
  );
}
