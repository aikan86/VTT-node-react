import { useState } from "react";
import { Modal } from "../../../components/Modal";
import { cellLengthIn, DISTANCE_UNITS, METERS_PER_FOOT, type DistanceUnit } from "../geometry";

interface Props {
  /** Distanza in pixel del mondo tra i due punti scelti. */
  pixelDistance: number;
  feetPerCell: number;
  onApply: (cells: number, alignToGrid: boolean) => void;
  onClose: () => void;
}

const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });

/** Chiede la distanza reale tra i due punti scelti sull'immagine. */
export function CalibrationDialog({ pixelDistance, feetPerCell, onApply, onClose }: Props) {
  const [text, setText] = useState("");
  const [unit, setUnit] = useState<DistanceUnit>("m");
  const [align, setAlign] = useState(true);

  const value = Number(text.trim().replace(",", "."));
  const cells = value > 0 ? value / cellLengthIn(unit, feetPerCell) : 0;
  const tooClose = pixelDistance < 2;
  const valid = Number.isFinite(cells) && cells > 0 && !tooClose;

  return (
    <Modal title="Calibra la mappa" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onApply(cells, align);
        }}
        style={{ display: "grid", gap: "0.8rem" }}
      >
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Quanto distano nella realtà i due punti che hai scelto? Una casella della griglia = {fmt(feetPerCell)} ft ({fmt(feetPerCell * METERS_PER_FOOT)} m).
        </p>
        {tooClose && <p className="callout">I due punti sono troppo vicini: annulla e sceglili più distanti.</p>}
        <div className="row" style={{ alignItems: "end" }}>
          <label className="field" style={{ flex: 1 }}>
            Distanza
            <input value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" autoFocus placeholder="es. 9" />
          </label>
          <label className="field">
            Unità
            <select value={unit} onChange={(e) => setUnit(e.target.value as DistanceUnit)}>
              {DISTANCE_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {valid && <p style={{ margin: 0 }}>= {fmt(cells)} caselle</p>}
        <label className="row" style={{ flexWrap: "nowrap" }}>
          <input type="checkbox" checked={align} onChange={(e) => setAlign(e.target.checked)} />
          Allinea il primo punto all'incrocio di griglia più vicino
        </label>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            Calibra
          </button>
        </div>
      </form>
    </Modal>
  );
}
