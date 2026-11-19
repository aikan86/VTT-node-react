import type Konva from "konva";
import { Circle, Group, Image as KImage, Layer, Line, Path, Rect, Text } from "react-konva";
import { useImage } from "../hooks";
import { cellToPx, CONDITION_INFO, sameRef, snapPxToCell, type Condition, type Ref, type Scene, type Token } from "@vtt/shared";
import type { EntityResolver } from "../../../store/entities";
import { clamp } from "../geometry";

interface Props {
  scene: Scene;
  resolve: EntityResolver;
  listening: boolean;
  editable: boolean;
  selectedId: string | null;
  currentRef: Ref | null;
  onSelect: (id: string) => void;
  onMove: (token: Token) => void;
  /** Non mostra le barre dei PF (vista giocatori). */
  hideHp?: boolean;
  /** Token trascinabili anche se il livello non è modificabile (i PG nella vista giocatori). */
  movable?: (token: Token) => boolean;
  /** Inizio del trascinamento di un token. */
  onDragStart?: (token: Token) => void;
  /** Dopo il rilascio il token torna dov'era: `onMove` riceve solo la destinazione proposta (da confermare). */
  snapBack?: boolean;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function hpFill(ratio: number) {
  return ratio > 0.5 ? "#22c55e" : ratio > 0.25 ? "#eab308" : "#ef4444";
}

/** Occhio barrato in un angolo del token: avvisa il master che i giocatori non lo vedono. */
function HiddenMark({ size }: { size: number }) {
  const k = Math.max(16, size * 0.3) / 24;
  return (
    <Group x={3} y={3} scaleX={k} scaleY={k} listening={false}>
      {(
        [
          ["#000000", 5.5],
          ["#ffffff", 2.5],
        ] as const
      ).map(([stroke, width]) => (
        <Group key={stroke}>
          <Path data="M2 12Q12 4 22 12Q12 20 2 12Z" stroke={stroke} strokeWidth={width} lineJoin="round" />
          <Circle x={12} y={12} radius={3} stroke={stroke} strokeWidth={width} />
          <Line points={[4, 4, 20, 20]} stroke={stroke} strokeWidth={width} lineCap="round" />
        </Group>
      ))}
    </Group>
  );
}

/**
 * Interno del token: l'immagine ritagliata nel cerchio (il bordo resta del colore del personaggio) oppure, senza immagine
 * o finché non è caricata, le iniziali.
 */
function TokenFace({ imageUrl, name, size, dim }: { imageUrl: string | undefined; name: string; size: number; dim: boolean }) {
  const image = useImage(imageUrl);
  const r = size / 2;
  if (!image) {
    return (
      <Text text={initials(name)} width={size} height={size} align="center" verticalAlign="middle" fontSize={Math.max(10, size * 0.34)} fontStyle="bold" fill="#ffffff" listening={false} />
    );
  }
  // ritaglio quadrato centrato (immagini non quadrate comprese), dentro al bordo colorato
  const inner = r - 6;
  const side = Math.min(image.width, image.height);
  return (
    <Group
      listening={false}
      opacity={dim ? 0.45 : 1}
      clipFunc={(ctx) => {
        ctx.arc(r, r, inner, 0, Math.PI * 2, false);
      }}
    >
      <KImage
        image={image}
        x={r - inner}
        y={r - inner}
        width={inner * 2}
        height={inner * 2}
        crop={{ x: (image.width - side) / 2, y: (image.height - side) / 2, width: side, height: side }}
      />
    </Group>
  );
}

/** Icone delle condizioni in fila sul bordo alto del token, da destra; quelle che non ci stanno diventano "+N". */
function ConditionBadges({ conditions, size }: { conditions: readonly Condition[]; size: number }) {
  if (conditions.length === 0) return null;
  const d = clamp(size * 0.34, 16, 30);
  const fit = Math.max(1, Math.floor(size / d));
  const overflow = conditions.length > fit;
  const shown = overflow ? conditions.slice(0, fit - 1) : conditions;
  const badges: { key: string; text: string }[] = shown.map((c) => ({ key: c, text: CONDITION_INFO[c].icon }));
  if (overflow) badges.push({ key: "more", text: `+${conditions.length - shown.length}` });
  return (
    <Group listening={false}>
      {badges.map((b, i) => {
        const x = size - d / 2 - i * d;
        return (
          <Group key={b.key} x={x} y={d * 0.2}>
            <Circle radius={d / 2} fill="#111827" stroke="#ffffff" strokeWidth={1} opacity={0.9} />
            <Text text={b.text} x={-d / 2} y={-d / 2} width={d} height={d} align="center" verticalAlign="middle" fontSize={d * (b.key === "more" ? 0.5 : 0.62)} fill="#ffffff" />
          </Group>
        );
      })}
    </Group>
  );
}

export function TokensLayer({ scene, resolve, listening, editable, selectedId, currentRef, onSelect, onMove, hideHp = false, movable, onDragStart, snapBack = false }: Props) {
  const g = scene.grid;

  return (
    <Layer listening={listening} visible={scene.layers.tokens.visible}>
      {scene.tokens.map((token) => {
        const entity = resolve(token.ref);
        if (!entity) return null; // token orfano (PNG rimosso): non viene disegnato
        const pos = cellToPx(token, g);
        const s = entity.size * g.cellPx;
        const r = s / 2;
        const ratio = entity.hp.max > 0 ? clamp(entity.hp.current / entity.hp.max, 0, 1) : 0;
        const isCurrent = currentRef !== null && sameRef(currentRef, token.ref);
        const isSelected = selectedId === token.id;
        const down = entity.hp.current <= 0;
        const barW = s - 8;
        const draggable = editable || (movable?.(token) ?? false);
        const setCursor = (e: Konva.KonvaEventObject<MouseEvent>, cursor: string) => {
          const container = e.target.getStage()?.container();
          if (container && !editable && draggable) container.style.cursor = cursor;
        };

        return (
          <Group
            key={token.id}
            x={pos.x}
            y={pos.y}
            draggable={draggable}
            onMouseDown={() => onSelect(token.id)}
            onTap={() => onSelect(token.id)}
            onMouseEnter={(e) => setCursor(e, "grab")}
            onMouseLeave={(e) => setCursor(e, "")}
            onDragStart={(e) => {
              e.target.moveToTop();
              onDragStart?.(token);
            }}
            onDragEnd={(e) => {
              const next = snapPxToCell(e.target.position(), g);
              e.target.position(snapBack ? pos : cellToPx(next, g));
              onMove({ ...token, ...next });
            }}
          >
            <Group opacity={token.hidden ? 0.4 : 1}>
            {isCurrent && (
              <Circle x={r} y={r} radius={r + 2} stroke="#e0a526" strokeWidth={5} shadowColor="#e0a526" shadowBlur={14} />
            )}
            <Circle
              x={r}
              y={r}
              radius={r - 3}
              fill={entity.color}
              opacity={down ? 0.45 : 1}
              stroke={isSelected ? "#ffffff" : "#0b0d12"}
              strokeWidth={isSelected ? 3 : 2}
              shadowColor="#000"
              shadowBlur={6}
              shadowOpacity={0.5}
            />
            <TokenFace imageUrl={entity.imageUrl} name={entity.name} size={s} dim={down} />
            {down && (
              <Line points={[s * 0.25, s * 0.25, s * 0.75, s * 0.75, s * 0.5, s * 0.5, s * 0.75, s * 0.25, s * 0.25, s * 0.75]} stroke="#ef4444" strokeWidth={4} listening={false} />
            )}
            {!hideHp && (
              <>
                <Rect x={4} y={s - 9} width={barW} height={5} fill="#111827" cornerRadius={2} listening={false} />
                <Rect x={4} y={s - 9} width={barW * ratio} height={5} fill={hpFill(ratio)} cornerRadius={2} listening={false} />
              </>
            )}
            <Text
              text={entity.name}
              x={-g.cellPx * 0.2}
              y={s + 2}
              width={s + g.cellPx * 0.4}
              align="center"
              wrap="none"
              ellipsis
              fontSize={12}
              fill="#ffffff"
              shadowColor="#000"
              shadowBlur={3}
              shadowOpacity={1}
              listening={false}
            />
            <ConditionBadges conditions={entity.conditions} size={s} />
            </Group>
            {token.hidden && <HiddenMark size={s} />}
          </Group>
        );
      })}
    </Layer>
  );
}
