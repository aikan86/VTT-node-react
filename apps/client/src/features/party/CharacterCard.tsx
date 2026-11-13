import { SAVE_KEYS, SAVE_LABELS, type Character } from "@vtt/shared";
import { NumberInput } from "../../components/NumberInput";
import { usePartyStore } from "../../store/partyStore";
import { deleteCharacter } from "../../store/actions";
import { reportError } from "../../store/statusStore";
import styles from "./Party.module.css";

export const SIZE_OPTIONS = [
  { value: 1, label: "Media (1×1)" },
  { value: 2, label: "Grande (2×2)" },
  { value: 3, label: "Enorme (3×3)" },
  { value: 4, label: "Mastod. (4×4)" },
];

export function CharacterCard({ character }: { character: Character }) {
  const update = usePartyStore((s) => s.update);
  const set = (patch: Partial<Character>) => update(character.id, patch);
  const setHp = (patch: Partial<Character["hp"]>) => update(character.id, (c) => ({ ...c, hp: { ...c.hp, ...patch } }));
  const name = character.name || "personaggio";

  return (
    <article className={styles.card} style={{ borderTopColor: character.color }} aria-label={`Scheda di ${name}`}>
      <div className={styles.cardHeader}>
        <input
          type="color"
          value={character.color}
          onChange={(e) => set({ color: e.target.value })}
          aria-label="Colore del token"
        />
        <input
          className={styles.name}
          value={character.name}
          onChange={(e) => set({ name: e.target.value })}
          onBlur={() => character.name.trim() === "" && set({ name: "Senza nome" })}
          aria-label="Nome"
          placeholder="Nome"
        />
        <button
          className="icon danger"
          title="Elimina personaggio"
          aria-label={`Elimina ${name}`}
          onClick={() => {
            if (confirm(`Eliminare ${name}? Verrà rimosso anche da iniziativa e mappa.`)) {
              deleteCharacter(character.id).catch(reportError);
            }
          }}
        >
          ✕
        </button>
      </div>

      <div className={styles.stats}>
        <label className="field">
          PF attuali
          <NumberInput value={character.hp.current} onChange={(v) => setHp({ current: v ?? 0 })} min={-999} max={9999} />
        </label>
        <label className="field">
          PF max
          <NumberInput value={character.hp.max} onChange={(v) => setHp({ max: v ?? 0 })} min={0} max={9999} />
        </label>
        <label className="field">
          PF temp
          <NumberInput value={character.hp.temp} onChange={(v) => setHp({ temp: v ?? 0 })} min={0} max={9999} />
        </label>
        <label className="field">
          CA
          <NumberInput value={character.ac} onChange={(v) => set({ ac: v ?? 0 })} min={0} max={50} />
        </label>
        <label className="field">
          Iniziativa
          <NumberInput value={character.initiativeMod} onChange={(v) => set({ initiativeMod: v ?? 0 })} min={-20} max={30} signed />
        </label>
        <label className="field">
          Taglia
          <select value={character.size} onChange={(e) => set({ size: Number(e.target.value) })}>
            {SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className={styles.saves}>
        <legend>Tiri salvezza</legend>
        {SAVE_KEYS.map((key) => (
          <label key={key} className="field">
            {SAVE_LABELS[key]}
            <NumberInput
              value={character.saves[key]}
              onChange={(v) => update(character.id, (c) => ({ ...c, saves: { ...c.saves, [key]: v ?? 0 } }))}
              min={-20}
              max={30}
              signed
              style={{ width: "100%" }}
            />
          </label>
        ))}
      </fieldset>

      <label className="field">
        Note
        <textarea rows={3} value={character.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
    </article>
  );
}
