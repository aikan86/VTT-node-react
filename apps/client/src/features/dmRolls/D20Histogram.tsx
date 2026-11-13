import { useState } from "react";
import { D20_FACES } from "@vtt/shared";
import { useElementSize } from "../battlefield/hooks";
import styles from "./DmRolls.module.css";

interface Props {
  /** Frequenze per faccia: indice 0 = faccia 1. */
  counts: readonly number[];
}

const HEIGHT = 240;
const M = { top: 14, right: 64, bottom: 30, left: 36 };
const MAX_BAR = 24;
const RADIUS = 4;

/** Passo "pulito" per l'asse Y, al massimo 5 intervalli. */
function niceStep(max: number): number {
  for (let mag = 1; ; mag *= 10) {
    for (const s of [1, 2, 5]) if (Math.ceil(max / (s * mag)) <= 5) return s * mag;
  }
}

/** Colonna con estremità arrotondata e base squadrata. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
export const describeFace = (face: number, count: number, total: number) =>
  `${face}: ${count} ${count === 1 ? "tiro" : "tiri"} (${total ? Math.round((count / total) * 100) : 0}%)`;

export function D20Histogram({ counts }: Props) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const width = Math.max(size.width || 720, 320);
  const total = counts.reduce((a, b) => a + b, 0);
  const expected = total / D20_FACES;
  const step = niceStep(Math.max(1, ...counts, expected));
  const yMax = Math.max(step, Math.ceil(Math.max(...counts, expected) / step) * step);
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);

  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const band = plotW / D20_FACES;
  const barW = Math.min(MAX_BAR, band - 2);
  const y = (v: number) => M.top + plotH - (v / yMax) * plotH;
  const bandX = (i: number) => M.left + i * band;

  const hovered = hover === null ? null : { i: hover, count: counts[hover] ?? 0 };

  return (
    <div ref={ref} className={styles.chart}>
      <svg width={width} height={HEIGHT} role="group" aria-label="Istogramma delle frequenze dei risultati del d20">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} className={styles.grid} />
            <text x={M.left - 8} y={y(t)} className={styles.axisText} textAnchor="end" dominantBaseline="middle">
              {t}
            </text>
          </g>
        ))}

        {counts.map((count, i) => {
          const cx = bandX(i) + band / 2;
          const top = y(count);
          return (
            <g
              key={i}
              role="img"
              aria-label={describeFace(i + 1, count, total)}
              tabIndex={0}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className={styles.column}
            >
              <rect x={bandX(i)} y={M.top} width={band} height={plotH} className={hover === i ? styles.bandHover : styles.band} />
              {count > 0 && <path d={columnPath(cx - barW / 2, top, barW, M.top + plotH - top)} className={styles.bar} />}
              <text x={cx} y={M.top + plotH + 18} textAnchor="middle" className={hover === i ? styles.axisTextStrong : styles.axisText}>
                {i + 1}
              </text>
            </g>
          );
        })}

        <line x1={M.left} x2={M.left + plotW} y1={M.top + plotH} y2={M.top + plotH} className={styles.baseline} />

        {total > 0 && (
          <g aria-hidden="true">
            <line x1={M.left} x2={M.left + plotW} y1={y(expected)} y2={y(expected)} className={styles.expected} />
            <text x={M.left + plotW + 6} y={y(expected)} dominantBaseline="middle" className={styles.axisText}>
              atteso {fmt(expected)}
            </text>
          </g>
        )}
      </svg>

      {total === 0 && <div className={styles.chartEmpty}>Nessun tiro registrato</div>}

      {hovered && (
        <div
          className={styles.tooltip}
          style={{ left: bandX(hovered.i) + band / 2, top: y(hovered.count) - 8 }}
          role="presentation"
        >
          <strong>{hovered.i + 1}</strong>
          <span>
            {hovered.count} {hovered.count === 1 ? "tiro" : "tiri"} · {total ? Math.round((hovered.count / total) * 100) : 0}%
          </span>
        </div>
      )}
    </div>
  );
}
