import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max"> {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  /** Se vero, un campo vuoto produce `null`. */
  allowEmpty?: boolean;
  /** Mostra il segno "+" per i valori positivi (modificatori). */
  signed?: boolean;
}

const format = (v: number | null, signed: boolean) => (v === null ? "" : signed && v > 0 ? `+${v}` : String(v));

/** Campo numerico intero che tollera stati intermedi ("-", "") durante la digitazione. */
export function NumberInput({ value, onChange, min, max, allowEmpty, signed = false, style, ...rest }: Props) {
  const [draft, setDraft] = useState(() => format(value, signed));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(format(value, signed));
  }, [value, signed]);

  const commit = (text: string) => {
    setDraft(text);
    const trimmed = text.trim();
    if (trimmed === "") {
      if (allowEmpty) onChange(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n)) return;
    if ((min !== undefined && n < min) || (max !== undefined && n > max)) return;
    onChange(n);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      {...rest}
      style={{ width: "4.5rem", ...style }}
      value={draft}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        setDraft(format(value, signed));
      }}
      onChange={(e) => commit(e.target.value)}
    />
  );
}
