import { useEffect, useState } from "react";
import { playerLink } from "./playerLinks";
import styles from "./Party.module.css";

/** Link alla vista sul telefono di un PG, con il pulsante per copiarlo. */
export function PlayerLink({ base, pcId, name }: { base: string; pcId: string; name: string }) {
  const url = playerLink(base, pcId);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className={styles.link}>
      <span className={styles.linkLabel}>📱 Vista sul telefono</span>
      <div className="row" style={{ flexWrap: "nowrap", gap: "0.4rem" }}>
        <input readOnly value={url} aria-label={`Link del giocatore di ${name}`} onFocus={(e) => e.currentTarget.select()} />
        <button
          onClick={() =>
            navigator.clipboard
              .writeText(url)
              .then(() => setCopied("ok"))
              .catch(() => setCopied("fail"))
          }
          aria-label={`Copia il link di ${name}`}
        >
          {copied === "ok" ? "Copiato ✓" : "Copia"}
        </button>
        <a href={url} target="_blank" rel="noreferrer" aria-label={`Apri la vista di ${name}`} title="Apri in una nuova scheda">
          ↗
        </a>
      </div>
      {copied === "fail" && <span className="muted">Copia non riuscita: seleziona il link e copialo a mano.</span>}
    </div>
  );
}
