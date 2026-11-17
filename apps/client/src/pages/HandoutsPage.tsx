import { useRef, useState } from "react";
import { currentHandout } from "@vtt/shared";
import { addHandout, deleteHandout, hideHandouts, renameHandout, showHandout, useLibraryStore } from "../store/libraryStore";
import { reportError } from "../store/statusStore";
import styles from "./Handouts.module.css";

/** Handout: immagini con titolo che il master mostra a schermo intero nella vista giocatori. */
export function HandoutsPage() {
  const handouts = useLibraryStore((s) => s.handouts);
  const shown = currentHandout(handouts);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const valid = title.trim().length > 0 && file !== null;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Handout</h1>
        <a href="/giocatori" target="_blank" rel="noreferrer">
          Apri vista giocatori ↗
        </a>
      </div>

      <section className={styles.card} aria-label="Ora a schermo">
        {shown ? (
          <div className="row" role="status">
            <span>
              I giocatori vedono a schermo intero: <strong>{shown.title}</strong>
            </span>
            <button className="primary" style={{ marginLeft: "auto" }} onClick={hideHandouts}>
              Torna alla mappa
            </button>
          </div>
        ) : (
          <span className="muted" role="status">
            Nessun handout a schermo: i giocatori vedono la mappa.
          </span>
        )}
      </section>

      <form
        className={styles.card}
        aria-label="Nuovo handout"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setUploading(true);
          try {
            await addHandout(title, file);
            setTitle("");
            setFile(null);
            if (fileRef.current) fileRef.current.value = "";
          } catch (err) {
            reportError(err);
          } finally {
            setUploading(false);
          }
        }}
      >
        <h2 className={styles.title}>Nuovo handout</h2>
        <div className="row" style={{ alignItems: "end" }}>
          <label className="field" style={{ flex: 1, minWidth: "12rem" }}>
            Titolo
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Es. Lettera del barone" />
          </label>
          <label className="field">
            Immagine
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <button type="submit" className="primary" disabled={!valid || uploading}>
            {uploading ? "Caricamento…" : "Carica"}
          </button>
        </div>
      </form>

      {handouts.length === 0 ? (
        <p className="muted">Nessun handout: carica un'immagine con un titolo.</p>
      ) : (
        <ul className={styles.grid} aria-label="Handout">
          {handouts.map((h) => {
            const isShown = shown?.id === h.id;
            return (
              <li key={h.id} className={isShown ? `${styles.item} ${styles.shown}` : styles.item} aria-current={isShown ? "true" : undefined}>
                <img src={h.imageUrl} alt={h.title} className={styles.thumb} />
                <input
                  className={styles.name}
                  value={h.title}
                  maxLength={120}
                  aria-label={`Titolo di ${h.title}`}
                  onChange={(e) => renameHandout(h.id, e.target.value)}
                />
                <div className="row">
                  {isShown ? (
                    <button className="active" onClick={hideHandouts}>
                      Nascondi ai giocatori
                    </button>
                  ) : (
                    <button className="primary" onClick={() => showHandout(h.id)}>
                      Mostra ai giocatori
                    </button>
                  )}
                  <button
                    className="danger"
                    style={{ marginLeft: "auto" }}
                    aria-label={`Elimina ${h.title}`}
                    onClick={() => {
                      if (confirm(`Eliminare l'handout "${h.title}"?`)) void deleteHandout(h.id);
                    }}
                  >
                    Elimina
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
