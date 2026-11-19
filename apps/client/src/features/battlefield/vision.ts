import { useMemo } from "react";
import { partySight, partyViewers, type PartySight, type Scene } from "@vtt/shared";
import type { EntityResolver } from "../../store/entities";

/**
 * Ciò che il party vede ora (linee di vista dei PG e, in una scena buia, luci e scurovisione), in pixel del mondo.
 * Vuoto se la visione è spenta o non c'è nessun PG: in quel caso non c'è nebbia.
 */
export function usePartySight(scene: Scene, resolve: EntityResolver): PartySight {
  const sizeOf = (ref: Parameters<EntityResolver>[0]) => resolve(ref)?.size;
  // ricalcolo solo quando cambia qualcosa che conta: chi guarda e da dove, cosa blocca, luci, impostazioni
  const viewersKey = scene.vision.enabled
    ? partyViewers(scene, sizeOf)
        .map((v) => `${v.origin.x},${v.origin.y},${v.darkvisionFt}`)
        .join("|")
    : "";
  return useMemo(
    () => partySight(scene, sizeOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewersKey, scene.elements, scene.sightBlockers, scene.objects, scene.lights, scene.dark, scene.vision, scene.grid],
  );
}
