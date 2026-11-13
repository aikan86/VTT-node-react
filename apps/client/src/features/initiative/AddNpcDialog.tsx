import { useState } from "react";
import type { NpcTemplate } from "@vtt/shared";
import { Modal } from "../../components/Modal";
import { NumberInput } from "../../components/NumberInput";
import { SIZE_OPTIONS } from "../party/CharacterCard";

export interface AddNpcResult {
  template: NpcTemplate;
  quantity: number;
  placeOnMap: boolean;
}

interface Props {
  onClose: () => void;
  onSubmit: (result: AddNpcResult) => void;
  /** Mostra la casella "piazza sulla mappa" (dal tracker). */
  showPlaceOption?: boolean;
}

export function AddNpcDialog({ onClose, onSubmit, showPlaceOption = false }: Props) {
  const [name, setName] = useState("Goblin");
  const [initiativeMod, setInitiativeMod] = useState(2);
  const [hpMax, setHpMax] = useState(7);
  const [ac, setAc] = useState(15);
  const [quantity, setQuantity] = useState(1);
  const [color, setColor] = useState("#dc2626");
  const [size, setSize] = useState(1);
  const [placeOnMap, setPlaceOnMap] = useState(true);

  const valid = name.trim().length > 0;

  return (
    <Modal title="Aggiungi PNG" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSubmit({
            template: { name: name.trim(), initiativeMod, hp: { current: hpMax, max: hpMax, temp: 0 }, ac, color, size },
            quantity,
            placeOnMap: showPlaceOption && placeOnMap,
          });
        }}
        style={{ display: "grid", gap: "0.8rem" }}
      >
        <div className="row" style={{ alignItems: "end" }}>
          <label className="field" style={{ flex: 1 }}>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required maxLength={80} />
          </label>
          <label className="field">
            Colore
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.6rem" }}>
          <label className="field">
            Mod. iniziativa
            <NumberInput value={initiativeMod} onChange={(v) => setInitiativeMod(v ?? 0)} min={-20} max={30} signed style={{ width: "100%" }} />
          </label>
          <label className="field">
            PF
            <NumberInput value={hpMax} onChange={(v) => setHpMax(v ?? 1)} min={1} max={9999} style={{ width: "100%" }} />
          </label>
          <label className="field">
            CA
            <NumberInput value={ac} onChange={(v) => setAc(v ?? 0)} min={0} max={50} style={{ width: "100%" }} />
          </label>
          <label className="field">
            Quantità
            <NumberInput value={quantity} onChange={(v) => setQuantity(v ?? 1)} min={1} max={30} style={{ width: "100%" }} />
          </label>
        </div>
        <label className="field">
          Taglia
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {showPlaceOption && (
          <label className="row">
            <input type="checkbox" checked={placeOnMap} onChange={(e) => setPlaceOnMap(e.target.checked)} />
            Piazza anche sulla mappa attiva
          </label>
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            Aggiungi
          </button>
        </div>
      </form>
    </Modal>
  );
}
