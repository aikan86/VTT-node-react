import { useRef, useState, type ChangeEvent } from "react";
import { api } from "../../api/http";
import { flushCombat } from "../../store/combatStore";
import { flushParty } from "../../store/partyStore";
import { flushScenes } from "../../store/sceneStore";
import { reportError } from "../../store/statusStore";
import styles from "./TransferButtons.module.css";

/** Salva subito le modifiche in coda, così il file esportato (o lo stato sostituito) è aggiornato. */
const flushAll = () => Promise.all([flushParty(), flushCombat(), flushScenes()]);

const CONFIRM_IMPORT = (name: string) =>
  `Importare "${name}"?\n\nTutto lo stato attuale (PG, scene, combattimento, tiri del DM) verrà sostituito.\n` +
  "Resta comunque recuperabile dalla cronologia delle versioni.";

/** Esporta l'intero stato in un file JSON e lo reimporta (sostituendo quello attuale). */
export function TransferButtons() {
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const onExport = async () => {
    try {
      await flushAll();
      const link = document.createElement("a");
      link.href = api.exportUrl;
      link.download = "";
      link.click();
    } catch (err) {
      reportError(err);
    }
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permette di riscegliere lo stesso file
    if (!file || !window.confirm(CONFIRM_IMPORT(file.name))) return;
    setBusy(true);
    try {
      await flushAll();
      await api.importState(file);
      // riparte pulito dallo stato importato (gli altri tab lo ricevono in tempo reale)
      window.location.reload();
    } catch (err) {
      reportError(err);
      setBusy(false);
    }
  };

  return (
    <div className={styles.transfer}>
      <button type="button" onClick={() => void onExport()} disabled={busy} title="Scarica tutto lo stato in un file">
        ⬇ Esporta
      </button>
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={busy}
        title="Sostituisci tutto lo stato con quello di un file esportato"
      >
        {busy ? "Importazione…" : "⬆ Importa"}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        aria-label="Importa stato da file"
        onChange={(e) => void onImport(e)}
        hidden
      />
    </div>
  );
}
