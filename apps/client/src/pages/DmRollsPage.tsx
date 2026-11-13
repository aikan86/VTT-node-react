import { useMemo } from "react";
import { D20_FACES, faceCounts, rollMean } from "@vtt/shared";
import { D20Histogram } from "../features/dmRolls/D20Histogram";
import styles from "../features/dmRolls/DmRolls.module.css";
import { useDmRollStore } from "../store/dmRollStore";

const FACES = Array.from({ length: D20_FACES }, (_, i) => i + 1);
const EXPECTED_MEAN = (D20_FACES + 1) / 2;

const timeFmt = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
function formatAt(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? timeFmt.format(d) : dateTimeFmt.format(d);
}
const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "—");

export function DmRollsPage() {
  const rolls = useDmRollStore((s) => s.rolls);
  const add = useDmRollStore((s) => s.add);
  const remove = useDmRollStore((s) => s.remove);

  const counts = useMemo(() => faceCounts(rolls), [rolls]);
  const mean = useMemo(() => rollMean(rolls), [rolls]);
  const total = rolls.length;
  const last = rolls.at(-1);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Tiri del DM</h1>
        <span className="badge">d20 sotto osservazione</span>
      </div>

      <section className={`${styles.card} ${styles.top}`} aria-label="Statistiche">
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span>Tiri registrati</span>
            <strong data-testid="stat-count">{total}</strong>
          </div>
          <div className={styles.stat}>
            <span>Media</span>
            <strong data-testid="stat-mean">
              {mean === null ? "—" : mean.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </strong>
            <small>attesa {EXPECTED_MEAN.toLocaleString("it-IT")}</small>
          </div>
          <div className={styles.stat}>
            <span>20 naturali</span>
            <strong>{counts[19]}</strong>
            <small>{pct(counts[19]!, total)} · atteso 5%</small>
          </div>
          <div className={styles.stat}>
            <span>1 naturali</span>
            <strong>{counts[0]}</strong>
            <small>{pct(counts[0]!, total)} · atteso 5%</small>
          </div>
        </div>
        <D20Histogram counts={counts} />
      </section>

      <div className={styles.columns}>
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Registra un tiro</h2>
          <div className={styles.pad} role="group" aria-label="Registra un tiro">
            {FACES.map((n) => (
              <button key={n} onClick={() => add(n)}>
                {n}
              </button>
            ))}
          </div>
          <div className={styles.padActions}>
            <span>{last ? `Ultimo: ${last.value}` : "Clicca il risultato appena tirato"}</span>
            {last && (
              <button onClick={() => remove(last.id)} aria-label={`Annulla ultimo tiro (${last.value})`}>
                ↶ Annulla ultimo
              </button>
            )}
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Storico</h2>
          {total === 0 ? (
            <p className="empty">Lo storico è vuoto: registra il primo tiro con i pulsanti.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Risultato</th>
                    <th>Ora</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rolls
                    .map((r, i) => ({ r, seq: i + 1 }))
                    .reverse()
                    .map(({ r, seq }) => (
                      <tr key={r.id} data-testid="dm-roll-row">
                        <td className={styles.seq} data-testid="seq">{seq}</td>
                        <td className={styles.value} data-testid="value">{r.value}</td>
                        <td className={styles.time}>{formatAt(r.at)}</td>
                        <td className={styles.actions}>
                          <button className="icon danger" onClick={() => remove(r.id)} title="Elimina" aria-label={`Elimina tiro ${seq} (${r.value})`}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
