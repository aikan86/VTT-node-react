import { useEffect, useMemo, useState } from "react";
import type { Scene } from "@vtt/shared";
import {
  duplicateInLibrary,
  loadFromLibrary,
  loadSceneLibrary,
  removeFromLibrary,
  renameInLibrary,
  saveSceneToLibrary,
  useSceneLibraryStore,
} from "../../../store/sceneLibraryStore";
import { reportError } from "../../../store/statusStore";
import styles from "../Battlefield.module.css";

interface Props {
  scene: Scene;
  /** Clic sulla mappa in attesa per il punto di partenza dei PG. */
  pickingStart: boolean;
  onPickStart: (picking: boolean) => void;
  onClearStart: () => void;
  onClose: () => void;
}

const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Libreria di scene riutilizzabili: salva la scena corrente, cerca, carica, duplica, rinomina, elimina. */
export function LibraryPanel({ scene, pickingStart, onPickStart, onClearStart, onClose }: Props) {
  const { items, loaded } = useSceneLibraryStore();
  const [name, setName] = useState(scene.name);
  const [query, setQuery] = useState("");
  const [bringPcs, setBringPcs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) loadSceneLibrary().catch(reportError);
  }, [loaded]);
  useEffect(() => setName(scene.name), [scene.id, scene.name]);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("it");
    return q ? items.filter((s) => s.name.toLocaleLowerCase("it").includes(q)) : items;
  }, [items, query]);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    try {
      setStatus(await action());
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  };

  const pcsHere = scene.tokens.filter((t) => t.ref.kind === "pc").length;

  return (
    <section className={styles.section} aria-label="Libreria di scene">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>Libreria di scene</h3>
        <button onClick={onClose}>Chiudi</button>
      </div>

      <form
        className={styles.selected}
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          void run(async () => {
            await saveSceneToLibrary(scene, trimmed);
            return `Salvata “${trimmed}”.`;
          });
        }}
      >
        <label>
          Nome nella libreria
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" disabled={busy || !name.trim()}>
          💾 Salva la scena corrente
        </button>
        <span className="muted" style={{ fontSize: "0.8rem" }}>
          Si salvano sfondo, griglia, muri, porte, oggetti, luci, visione e PNG piazzati; non la nebbia esplorata né i PG.
        </span>
      </form>

      <div className={styles.selected}>
        <strong>Punto di partenza dei PG</strong>
        <span className="muted" style={{ fontSize: "0.85rem" }}>
          {scene.pcStart ? `Casella ${scene.pcStart.x}, ${scene.pcStart.y} (🚩 sulla mappa)` : "Non impostato: i PG partono dal centro della mappa."}
        </span>
        <div className={styles.tools}>
          <button className={pickingStart ? "active" : ""} aria-pressed={pickingStart} onClick={() => onPickStart(!pickingStart)}>
            {pickingStart ? "Annulla" : "🚩 Imposta con un clic"}
          </button>
          {scene.pcStart && <button onClick={onClearStart}>Rimuovi</button>}
        </div>
      </div>

      <input type="search" placeholder="Cerca per nome…" aria-label="Cerca nella libreria" value={query} onChange={(e) => setQuery(e.target.value)} />
      <label className="row" style={{ gap: "0.4rem" }}>
        <input type="checkbox" checked={bringPcs} onChange={(e) => setBringPcs(e.target.checked)} />
        Porta con me i PG{pcsHere > 0 ? ` (${pcsHere} sulla mappa)` : ""}
      </label>

      {status && (
        <p role="status" className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          {status}
        </p>
      )}

      {!loaded ? (
        <p className="muted">Caricamento…</p>
      ) : items.length === 0 ? (
        <p className="muted">Nessuna scena salvata: prepara una mappa e salvala qui per riusarla.</p>
      ) : shown.length === 0 ? (
        <p className="muted">Nessuna scena con questo nome.</p>
      ) : (
        <ul className={styles.list} aria-label="Scene salvate">
          {shown.map((s) => (
            <li key={s.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <span style={{ whiteSpace: "normal" }}>
                {s.thumbnailUrl ? (
                  <img src={s.thumbnailUrl} alt={`Miniatura di ${s.name}`} style={{ width: 64, height: 40, objectFit: "cover", borderRadius: 4, flex: "none" }} />
                ) : (
                  <span aria-label="Senza immagine" style={{ width: 64, height: 40, display: "grid", placeItems: "center", background: "var(--bg)", borderRadius: 4, flex: "none" }}>
                    ▦
                  </span>
                )}
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <strong className={styles.entityName}>{s.name}</strong>
                  <span className="muted" style={{ fontSize: "0.75rem" }}>
                    {dateFormat.format(new Date(s.updatedAt))}
                    {s.npcCount > 0 ? ` · ${s.npcCount} PNG` : ""}
                  </span>
                </span>
              </span>
              <span className={styles.tools}>
                <button
                  disabled={busy}
                  aria-label={`Carica ${s.name}`}
                  onClick={() =>
                    run(async () => {
                      const created = await loadFromLibrary(s.id, { from: scene, bringPcs });
                      return `Caricata “${created.name}” come nuova scena${created.shownToPlayers ? ", in onda ai giocatori" : ""}.`;
                    })
                  }
                >
                  Carica
                </button>
                <button disabled={busy} aria-label={`Duplica ${s.name}`} onClick={() => run(async () => (await duplicateInLibrary(s.id), null))}>
                  Duplica
                </button>
                <button
                  disabled={busy}
                  aria-label={`Rinomina ${s.name}`}
                  onClick={() => {
                    const next = prompt("Nuovo nome della scena salvata", s.name)?.trim();
                    if (next && next !== s.name) void run(async () => (await renameInLibrary(s.id, next.slice(0, 80)), null));
                  }}
                >
                  Rinomina
                </button>
                <button
                  className="danger"
                  disabled={busy}
                  aria-label={`Elimina ${s.name}`}
                  onClick={() => {
                    if (confirm(`Eliminare “${s.name}” dalla libreria? Le scene già caricate restano.`)) {
                      void run(async () => (await removeFromLibrary(s.id), `Eliminata “${s.name}”.`));
                    }
                  }}
                >
                  Elimina
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
