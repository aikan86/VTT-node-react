import { useState } from "react";
import { Circle, Group, Line, Text, Transformer } from "react-konva";
import type Konva from "konva";
import type { Drawing, FreehandDrawing, Grid, LineDrawing, Point } from "@vtt/shared";
import { cellPointsToPx, clamp, pxPointsToCells, roundCell, snapAngle, translatePoints } from "../geometry";
import type { SketchDraft } from "../types";
import { useTransformer } from "./useTransformer";

type GridGeom = Pick<Grid, "cellPx" | "offsetX" | "offsetY">;
type KonvaEvent = Konva.KonvaEventObject<MouseEvent>;

interface Props {
  drawings: Drawing[];
  grid: GridGeom;
  editable: boolean;
  /** Gomma attiva: click o trascinamento sopra un disegno lo elimina. */
  erasing: boolean;
  selectedId: string | null;
  /** Le maniglie restano della stessa dimensione sullo schermo a ogni zoom. */
  viewScale: number;
  draft: (SketchDraft & { color: string; strokeWidth: number }) | null;
  onSelect: (id: string) => void;
  onChange: (drawing: Drawing) => void;
  onErase: (id: string) => void;
}

const HIT_PX = 14;
const HANDLE_PX = 7;

export function Drawings({ drawings, grid: g, editable, erasing, selectedId, viewScale, draft, onSelect, onChange, onErase }: Props) {
  const selectedText = drawings.find((d) => d.id === selectedId && d.kind === "text");
  const { transformer, register } = useTransformer(selectedText ? selectedId : null, editable);
  /** Estremi della linea mentre se ne trascina uno (pixel del mondo). */
  const [lineEdit, setLineEdit] = useState<{ id: string; points: number[] } | null>(null);

  const toCell = (px: number, axis: "x" | "y") => roundCell((px - (axis === "x" ? g.offsetX : g.offsetY)) / g.cellPx);

  const pointer = (id: string) => ({
    onMouseDown: (e: KonvaEvent) => {
      if (!erasing) return onSelect(id);
      e.cancelBubble = true;
      onErase(id);
    },
    onMouseEnter: (e: KonvaEvent) => {
      if (erasing && e.evt.buttons & 1) onErase(id);
    },
    onTap: () => (erasing ? onErase(id) : onSelect(id)),
  });

  /** Fine trascinamento di un tratto: sposta tutti i punti e riporta il nodo all'origine. */
  const moveStroke = (d: LineDrawing | FreehandDrawing) => (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== e.currentTarget) return; // trascinamento di una maniglia
    const points = translatePoints(d.points, e.target.x() / g.cellPx, e.target.y() / g.cellPx).map(roundCell);
    e.target.position({ x: 0, y: 0 });
    onChange(d.kind === "line" ? { ...d, points: points as LineDrawing["points"] } : { ...d, points });
  };

  const handles = (d: LineDrawing, px: number[]) => {
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = px;
    const ends: Point[] = [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ];
    return ends.map((end, i) => {
      const other = ends[1 - i] ?? end;
      const pointsWith = (p: Point) => (i === 0 ? [p.x, p.y, other.x, other.y] : [other.x, other.y, p.x, p.y]);
      const target = (e: Konva.KonvaEventObject<DragEvent>) => {
        const p = e.evt.shiftKey ? snapAngle(other, e.target.position()) : e.target.position();
        e.target.position(p);
        return p;
      };
      return (
        <Circle
          key={i}
          x={end.x}
          y={end.y}
          radius={HANDLE_PX / viewScale}
          fill="#ffffff"
          stroke="#111827"
          strokeWidth={1.5 / viewScale}
          draggable
          onMouseDown={(e) => (e.cancelBubble = true)}
          onDragMove={(e) => {
            e.cancelBubble = true;
            setLineEdit({ id: d.id, points: pointsWith(target(e)) });
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            const next = pxPointsToCells(pointsWith(target(e)), g) as LineDrawing["points"];
            setLineEdit(null);
            onChange({ ...d, points: next });
          }}
        />
      );
    });
  };

  return (
    <>
      {drawings.map((d) => {
        const selected = d.id === selectedId;
        const highlight = { shadowColor: "#ffffff", shadowBlur: 10, shadowEnabled: selected };
        switch (d.kind) {
          case "text":
            return (
              <Text
                key={d.id}
                ref={register(d.id)}
                {...pointer(d.id)}
                {...highlight}
                x={g.offsetX + d.x * g.cellPx}
                y={g.offsetY + d.y * g.cellPx}
                rotation={d.rotation}
                text={d.text || "Testo"}
                opacity={d.text ? 1 : 0.5}
                fontSize={d.fontSize}
                fontStyle="bold"
                fill={d.color}
                stroke="#000000"
                strokeWidth={Math.max(1, d.fontSize / 16)}
                fillAfterStrokeEnabled
                lineHeight={1.2}
                draggable={editable}
                onDragEnd={(e) => onChange({ ...d, x: toCell(e.target.x(), "x"), y: toCell(e.target.y(), "y") })}
                onTransformEnd={(e) => {
                  const node = e.target;
                  const fontSize = clamp(Math.round(d.fontSize * node.scaleX()), 4, 400);
                  node.scale({ x: 1, y: 1 });
                  onChange({ ...d, fontSize, rotation: Math.round(node.rotation()), x: toCell(node.x(), "x"), y: toCell(node.y(), "y") });
                }}
              />
            );
          case "line": {
            const px = lineEdit?.id === d.id ? lineEdit.points : cellPointsToPx(d.points, g);
            return (
              <Group key={d.id} {...pointer(d.id)} draggable={editable} onDragEnd={moveStroke(d)}>
                <Line {...highlight} points={px} stroke={d.color} strokeWidth={d.strokeWidth} lineCap="round" hitStrokeWidth={Math.max(d.strokeWidth, HIT_PX / viewScale)} />
                {selected && editable && handles(d, px)}
              </Group>
            );
          }
          case "freehand":
            return (
              <Line
                key={d.id}
                {...pointer(d.id)}
                {...highlight}
                points={cellPointsToPx(d.points, g)}
                stroke={d.color}
                strokeWidth={d.strokeWidth}
                lineCap="round"
                lineJoin="round"
                tension={0.4}
                hitStrokeWidth={Math.max(d.strokeWidth, HIT_PX / viewScale)}
                draggable={editable}
                onDragEnd={moveStroke(d)}
              />
            );
        }
      })}
      {draft && (
        <Line
          points={draft.points}
          stroke={draft.color}
          strokeWidth={draft.strokeWidth}
          lineCap="round"
          lineJoin="round"
          tension={draft.kind === "freehand" ? 0.4 : 0}
          opacity={0.8}
          listening={false}
        />
      )}
      <Transformer
        ref={transformer}
        enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
        keepRatio
        rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
        rotationSnapTolerance={8}
        boundBoxFunc={(oldBox, box) => (Math.abs(box.height) < 6 ? oldBox : box)}
      />
    </>
  );
}
