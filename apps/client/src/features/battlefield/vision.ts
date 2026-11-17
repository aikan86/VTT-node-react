import { useMemo } from "react";
import { partyOrigins, sightSegments, visibilityPolygon, visionRadiusPx, type Scene } from "@vtt/shared";
import type { EntityResolver } from "../../store/entities";

/**
 * Poligoni di ciò che il party vede ora (uno per personaggio giocante sulla mappa), in pixel del mondo.
 * Vuoto se la visione è spenta o non c'è nessun PG: in quel caso non c'è nebbia.
 */
export function usePartyVision(scene: Scene, resolve: EntityResolver): number[][] {
  const g = scene.grid;
  const origins = scene.vision.enabled ? partyOrigins(scene, (ref) => resolve(ref)?.size) : [];
  const originsKey = origins.map((o) => `${o.x},${o.y}`).join("|");

  const segments = useMemo(
    () => sightSegments(scene),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene.elements, scene.sightBlockers, scene.objects, g.cellPx, g.offsetX, g.offsetY],
  );
  const radius = visionRadiusPx(scene.vision, g);
  return useMemo(
    () => origins.map((o) => visibilityPolygon(o, segments, radius)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [originsKey, segments, radius],
  );
}
