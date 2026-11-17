import { useRef, useState } from "react";
import {
  groupSummary,
  monsterTemplate,
  parseMonsterFile,
  PRESET_MONSTERS,
  srdIndexFor,
  statsFromTemplate,
  type MonsterStats,
  type NpcGroupMember,
  type NpcTemplate,
} from "@vtt/shared";
import { Modal } from "../../components/Modal";
import { TokenImagePicker } from "../../components/TokenImagePicker";
import { NumberInput } from "../../components/NumberInput";
import { addMonsters, deleteMonster, deleteNpcGroup, saveNpcGroup, useLibraryStore } from "../../store/libraryStore";
import { SIZE_OPTIONS } from "../party/CharacterCard";
import styles from "./Initiative.module.css";

/** PNG da creare: `quantity` copie di `template`. */
export interface NpcEntry {
  template: NpcTemplate;
  quantity: number;
}

export interface AddNpcResult {
  entries: NpcEntry[];
  placeOnMap: boolean;
}

interface Props {
  onClose: () => void;
  onSubmit: (result: AddNpcResult) => void;
  /** Mostra la casella "piazza sulla mappa" (dal tracker). */
  showPlaceOption?: boolean;
}

/** I membri di un gruppo come PNG da creare. */
export const groupEntries = (members: readonly NpcGroupMember[]): NpcEntry[] =>
  members.map((m) => ({ template: monsterTemplate(m.monster), quantity: m.quantity }));

const GOBLIN = PRESET_MONSTERS.find((m) => m.name === "Goblin")!;

export function AddNpcDialog({ onClose, onSubmit, showPlaceOption = false }: Props) {
  const monsters = useLibraryStore((s) => s.monsters);
  const groups = useLibraryStore((s) => s.npcGroups);
  const [source, setSource] = useState(`preset:${PRESET_MONSTERS.indexOf(GOBLIN)}`);
  const [name, setName] = useState(GOBLIN.name);
  const [initiativeMod, setInitiativeMod] = useState(GOBLIN.initiativeMod);
  const [hpMax, setHpMax] = useState(GOBLIN.hp);
  const [ac, setAc] = useState(GOBLIN.ac);
  const [quantity, setQuantity] = useState(1);
  const [color, setColor] = useState(GOBLIN.color);
  const [size, setSize] = useState<number>(GOBLIN.size);
  const [imageUrl, setImageUrl] = useState<string | undefined>(GOBLIN.imageUrl);
  const [placeOnMap, setPlaceOnMap] = useState(true);
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<NpcGroupMember[]>([]);
  const [groupName, setGroupName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const valid = name.trim().length > 0;
  const template = (): NpcTemplate => ({
    name: name.trim(),
    initiativeMod,
    hp: { current: hpMax, max: hpMax, temp: 0 },
    ac,
    color,
    size,
    ...(imageUrl ? { imageUrl } : {}),
  });
  const customId = source.startsWith("custom:") ? source.slice("custom:".length) : null;
  const monsterOf = (value: string): MonsterStats | undefined => {
    const [kind, key] = value.split(":") as [string, string];
    return kind === "preset" ? PRESET_MONSTERS[Number(key)] : kind === "custom" ? monsters.find((x) => x.id === key) : undefined;
  };
  const chosen = monsterOf(source);

  const fill = (m: MonsterStats) => {
    setName(m.name);
    setInitiativeMod(m.initiativeMod);
    setHpMax(m.hp);
    setAc(m.ac);
    setColor(m.color);
    setSize(m.size);
    setImageUrl(m.imageUrl);
  };

  const choose = (value: string) => {
    setSource(value);
    const m = monsterOf(value);
    if (m) fill(m);
  };

  const submit = (entries: NpcEntry[]) => onSubmit({ entries, placeOnMap: showPlaceOption && placeOnMap });

  const importFile = async (file: File) => {
    try {
      const { monsters: imported, skipped } = parseMonsterFile(await file.text());
      addMonsters(imported);
      const n = imported.length;
      setImportMessage({
        ok: true,
        text: `${n === 1 ? "Importato 1 mostro" : `Importati ${n} mostri`} nel tuo bestiario${skipped ? ` (${skipped} scartati: mancano nome, PF o CA)` : ""}.`,
      });
    } catch (err) {
      setImportMessage({ ok: false, text: err instanceof Error ? err.message : "Importazione non riuscita" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Modal title="Aggiungi PNG" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) submit([{ template: template(), quantity }]);
        }}
        style={{ display: "grid", gap: "0.8rem" }}
      >
        <fieldset className={styles.fieldset}>
          <legend>Bestiario</legend>
          <div className="row" style={{ alignItems: "end" }}>
            <label className="field" style={{ flex: 1, minWidth: "14rem" }}>
              Mostro
              <select value={source} onChange={(e) => choose(e.target.value)}>
                <option value="">— Personalizzato —</option>
                {monsters.length > 0 && (
                  <optgroup label="Il tuo bestiario">
                    {monsters.map((m) => (
                      <option key={m.id} value={`custom:${m.id}`}>
                        {m.name}
                        {m.cr ? ` (GS ${m.cr})` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Preimpostati">
                  {PRESET_MONSTERS.map((m, i) => (
                    <option key={m.name} value={`preset:${i}`}>
                      {m.name} (GS {m.cr})
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="File JSON del bestiario" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
            }} />
            <button type="button" onClick={() => fileRef.current?.click()} title="Array JSON di mostri: name, hp, ac, initiativeMod, size, color, cr (anche formato 5e: hit_points, armor_class, dexterity…)">
              Importa JSON…
            </button>
          </div>
          <div className="row">
            <button
              type="button"
              disabled={!valid}
              onClick={() => {
                const [saved] = addMonsters([{ ...statsFromTemplate(template()), ...(chosen?.srd ? { srd: chosen.srd } : {}) }]);
                if (saved) setSource(`custom:${saved.id}`);
              }}
            >
              Salva nel bestiario
            </button>
            {customId && (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  void deleteMonster(customId);
                  setSource("");
                }}
              >
                Rimuovi dal bestiario
              </button>
            )}
          </div>
          {importMessage && (
            <p role={importMessage.ok ? "status" : "alert"} className={importMessage.ok ? "muted" : styles.error} style={{ margin: 0, fontSize: "0.85rem" }}>
              {importMessage.text}
            </p>
          )}
        </fieldset>

        <div className="row" style={{ alignItems: "end" }}>
          <label className="field" style={{ flex: 1 }}>
            Nome
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSource("");
              }}
              autoFocus
              required
              maxLength={80}
            />
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
        <div className="field">
          Immagine del token
          <TokenImagePicker
            name={name.trim() || "PNG"}
            imageUrl={imageUrl}
            onChange={setImageUrl}
            srdIndex={srdIndexFor({ name, srd: chosen?.srd })}
            autoSearchKey={chosen ? source : null}
          />
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

        <fieldset className={styles.fieldset}>
          <legend>Gruppi di PNG</legend>
          {groups.length > 0 ? (
            <ul className={styles.groupList} aria-label="Gruppi salvati">
              {groups.map((g) => (
                <li key={g.id}>
                  <span>
                    <strong>{g.name}</strong> <span className="muted">· {groupSummary(g)}</span>
                  </span>
                  <span className="row" style={{ flexWrap: "nowrap", gap: "0.3rem" }}>
                    <button type="button" className="primary" onClick={() => submit(groupEntries(g.members))} aria-label={`Aggiungi il gruppo ${g.name}`}>
                      Aggiungi
                    </button>
                    <button
                      type="button"
                      className="icon danger"
                      aria-label={`Elimina il gruppo ${g.name}`}
                      onClick={() => {
                        if (confirm(`Eliminare il gruppo "${g.name}"?`)) void deleteNpcGroup(g.id);
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              Nessun gruppo salvato. Imposta un mostro e la quantità, poi "Aggiungi al gruppo".
            </p>
          )}
          <div className="row">
            <button type="button" disabled={!valid} onClick={() => setDraft((d) => [...d, { monster: statsFromTemplate(template()), quantity }])}>
              + Aggiungi al gruppo: {quantity} {name.trim() || "…"}
            </button>
          </div>
          {draft.length > 0 && (
            <div className={styles.draft} aria-label="Nuovo gruppo">
              <ul className={styles.groupList}>
                {draft.map((m, i) => (
                  <li key={i}>
                    <span>
                      {m.quantity} {m.monster.name}
                    </span>
                    <button type="button" className="icon" aria-label={`Togli ${m.monster.name} dal gruppo`} onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <div className="row" style={{ alignItems: "end" }}>
                <label className="field" style={{ flex: 1 }}>
                  Nome del gruppo
                  <input value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={80} placeholder="Es. Banda di goblin" />
                </label>
                <button
                  type="button"
                  disabled={!groupName.trim()}
                  onClick={() => {
                    saveNpcGroup(groupName, draft);
                    setDraft([]);
                    setGroupName("");
                  }}
                >
                  Salva gruppo
                </button>
              </div>
            </div>
          )}
        </fieldset>

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
            Aggiungi {quantity > 1 ? `${quantity} PNG` : "PNG"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
