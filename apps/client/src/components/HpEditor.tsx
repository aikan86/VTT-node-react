import { useState } from "react";
import { applyDamage, applyHealing, type Hp } from "@vtt/shared";
import styles from "./HpEditor.module.css";

interface Props {
  hp: Hp;
  onChange: (hp: Hp) => void;
  label: string;
}

export function hpColor(hp: Hp): string {
  const ratio = hp.max > 0 ? hp.current / hp.max : 0;
  return ratio > 0.5 ? "var(--ok)" : ratio > 0.25 ? "#eab308" : "var(--danger)";
}

/** PF attuali con barra e modifica rapida (danno / cura). */
export function HpEditor({ hp, onChange, label }: Props) {
  const [amount, setAmount] = useState("");
  const value = Number(amount);
  const valid = amount.trim() !== "" && Number.isInteger(value) && value > 0;

  const apply = (fn: (hp: Hp, n: number) => Hp) => {
    if (!valid) return;
    onChange(fn(hp, value));
    setAmount("");
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.numbers}>
        <strong style={{ color: hpColor(hp) }}>{hp.current}</strong>
        <span className="muted">/{hp.max}</span>
        {hp.temp > 0 && <span className={styles.temp}>+{hp.temp}</span>}
      </div>
      <div className={styles.bar} aria-hidden>
        <div style={{ width: `${hp.max ? Math.min(100, (hp.current / hp.max) * 100) : 0}%`, background: hpColor(hp) }} />
      </div>
      <form
        className={styles.quick}
        onSubmit={(e) => {
          e.preventDefault();
          apply(applyDamage);
        }}
      >
        <input
          aria-label={`Quantità PF per ${label}`}
          inputMode="numeric"
          placeholder="±"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
        />
        <button type="submit" className="icon danger" disabled={!valid} title="Danno (Invio)" aria-label={`Danno a ${label}`}>
          −
        </button>
        <button type="button" className="icon" disabled={!valid} title="Cura" aria-label={`Cura ${label}`} onClick={() => apply(applyHealing)} style={{ color: "var(--ok)" }}>
          +
        </button>
      </form>
    </div>
  );
}
