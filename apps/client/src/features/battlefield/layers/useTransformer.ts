import { useEffect, useRef } from "react";
import type Konva from "konva";

/** Collega un Transformer al nodo selezionato (registrato in `nodes`). */
export function useTransformer(selectedId: string | null, enabled: boolean) {
  const transformer = useRef<Konva.Transformer>(null);
  const nodes = useRef(new Map<string, Konva.Node>());

  useEffect(() => {
    const tr = transformer.current;
    if (!tr) return;
    const node = enabled && selectedId ? nodes.current.get(selectedId) : undefined;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  });

  const register = (id: string) => (node: Konva.Node | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };

  return { transformer, register };
}
