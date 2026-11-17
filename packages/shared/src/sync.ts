/** Contratto di sincronizzazione client/server (versioni ottimistiche + eventi in tempo reale). */

/** Documento con la sua versione: ogni scrittura riuscita incrementa `rev`. */
export interface Versioned<T> {
  rev: number;
  data: T;
}

/** Evento inviato a tutti i client su `/api/events` (Server-Sent Events). `data: null` = documento eliminato. */
export interface DocChange {
  collection: string;
  id: string;
  rev: number;
  data: unknown;
  /** Id del tab che ha fatto la modifica (per ignorare i propri echi). */
  origin: string | null;
}

/** Header con cui ogni tab si identifica nelle richieste di scrittura. */
export const CLIENT_ID_HEADER = "x-vtt-client";

/** Collezioni sincronizzate. Il combattimento è un documento singleton con id "current". */
export const COLLECTIONS = {
  characters: "characters",
  scenes: "scenes",
  combat: "combat",
  dmRolls: "dm-rolls",
  handouts: "handouts",
  monsters: "monsters",
  npcGroups: "npc-groups",
} as const;
export const COMBAT_DOC_ID = "current";
