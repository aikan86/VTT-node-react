import { describe, expect, it } from "vitest";
import type { Combat, Combatant, Ref } from "../src";
import { emptyCombat } from "../src";
import {
  addCombatant,
  addNpcs,
  addParty,
  canMove,
  endCombat,
  getTotal,
  moveCombatant,
  nextTurn,
  removeCombatant,
  rollAll,
  setNotes,
  setRoll,
  sortCombatants,
  startCombat,
  toggleActed,
} from "../src/initiative";

const mods: Record<string, number> = { a: 2, b: 5, c: 0, d: 2 };
const getMod = (ref: Ref) => mods[ref.id] ?? 0;

function c(id: string, roll: number | null, order = 0, acted = false): Combatant {
  return { id, ref: { kind: "pc", id }, roll, acted, order, notes: "" };
}

function combatOf(...combatants: Combatant[]): Combat {
  return { ...emptyCombat(), combatants };
}

const ids = (list: Combatant[]) => list.map((x) => x.id);

describe("getTotal", () => {
  it("adds roll and modifier, null when not rolled", () => {
    expect(getTotal(c("a", 10), getMod)).toBe(12);
    expect(getTotal(c("a", null), getMod)).toBeNull();
  });
});

describe("sortCombatants", () => {
  it("orders by total descending", () => {
    // a=12, b=8, c=15
    const sorted = sortCombatants([c("a", 10), c("b", 3), c("c", 15)], getMod);
    expect(ids(sorted)).toEqual(["c", "a", "b"]);
  });

  it("breaks ties by higher modifier, then manual order", () => {
    // a: 10+2=12, b: 7+5=12 -> b first (mod 5); d: 10+2=12 same mod as a -> order decides
    const sorted = sortCombatants([c("a", 10, 1), c("d", 10, 0), c("b", 7, 2)], getMod);
    expect(ids(sorted)).toEqual(["b", "d", "a"]);
  });

  it("puts un-rolled combatants last, keeping manual order", () => {
    const sorted = sortCombatants([c("a", null, 1), c("b", 1, 2), c("c", null, 0)], getMod);
    expect(ids(sorted)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input", () => {
    const list = [c("b", 1), c("c", 20)];
    sortCombatants(list, getMod);
    expect(ids(list)).toEqual(["b", "c"]);
  });
});

describe("rolls", () => {
  it("rollAll only rolls for combatants without a roll", () => {
    const combat = combatOf(c("a", 17), c("b", null));
    const next = rollAll(combat, () => 0); // rng 0 -> 1
    expect(next.combatants.map((x) => x.roll)).toEqual([17, 1]);
    expect(combat.combatants[1]!.roll).toBeNull();
  });

  it("setRoll stores a manual d20 value or clears it", () => {
    const combat = combatOf(c("a", null));
    expect(setRoll(combat, "a", 14).combatants[0]!.roll).toBe(14);
    expect(setRoll(setRoll(combat, "a", 14), "a", null).combatants[0]!.roll).toBeNull();
  });

  it("setRoll rejects values outside 1..20", () => {
    const combat = combatOf(c("a", null));
    expect(() => setRoll(combat, "a", 0)).toThrow(RangeError);
    expect(() => setRoll(combat, "a", 21)).toThrow(RangeError);
    expect(() => setRoll(combat, "a", 2.5)).toThrow(RangeError);
  });
});

describe("adding and removing", () => {
  it("addCombatant appends with increasing order and ignores duplicates", () => {
    let combat = addCombatant(emptyCombat(), { kind: "pc", id: "a" });
    combat = addCombatant(combat, { kind: "pc", id: "b" });
    combat = addCombatant(combat, { kind: "pc", id: "a" });
    expect(combat.combatants.map((x) => x.ref.id)).toEqual(["a", "b"]);
    expect(combat.combatants[1]!.order).toBeGreaterThan(combat.combatants[0]!.order);
    expect(combat.combatants.every((x) => x.roll === null && !x.acted && x.notes === "")).toBe(true);
  });

  it("setNotes stores combat notes for one combatant", () => {
    const combat = combatOf(c("a", null), c("b", null));
    const next = setNotes(combat, "b", "Prono, concentrato su Benedizione");
    expect(next.combatants.map((x) => x.notes)).toEqual(["", "Prono, concentrato su Benedizione"]);
    expect(combat.combatants[1]!.notes).toBe("");
  });

  it("addParty adds only characters not already present", () => {
    let combat = addCombatant(emptyCombat(), { kind: "pc", id: "a" });
    combat = addParty(combat, [{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(combat.combatants.map((x) => x.ref.id)).toEqual(["a", "b", "c"]);
  });

  it("addNpcs creates numbered npcs when quantity > 1", () => {
    const template = { name: "Goblin", color: "#ff0000", hp: { current: 7, max: 7, temp: 0 }, ac: 15, initiativeMod: 2, size: 1 };
    const { combat, npcs } = addNpcs(emptyCombat(), template, 3);
    expect(npcs.map((n) => n.name)).toEqual(["Goblin 1", "Goblin 2", "Goblin 3"]);
    expect(combat.npcs).toHaveLength(3);
    expect(combat.combatants.map((x) => x.ref)).toEqual(npcs.map((n) => ({ kind: "npc", id: n.id })));

    const again = addNpcs(combat, template, 2);
    expect(again.npcs.map((n) => n.name)).toEqual(["Goblin 4", "Goblin 5"]);
  });

  it("addNpcs keeps the plain name for a single npc", () => {
    const template = { name: "Drago", color: "#ff0000", hp: { current: 90, max: 90, temp: 0 }, ac: 18, initiativeMod: 0, size: 3 };
    expect(addNpcs(emptyCombat(), template, 1).npcs[0]!.name).toBe("Drago");
  });

  it("removeCombatant drops the npc too and moves the turn on if it was current", () => {
    const template = { name: "Orco", color: "#00ff00", hp: { current: 15, max: 15, temp: 0 }, ac: 13, initiativeMod: 0, size: 1 };
    let { combat } = addNpcs(addCombatant(emptyCombat(), { kind: "pc", id: "a" }), template, 1);
    const orc = combat.combatants[1]!;
    combat = setRoll(setRoll(combat, orc.id, 20), combat.combatants[0]!.id, 1);
    combat = startCombat(combat, getMod);
    expect(combat.currentId).toBe(orc.id);

    combat = removeCombatant(combat, orc.id, getMod);
    expect(combat.npcs).toHaveLength(0);
    expect(combat.combatants).toHaveLength(1);
    expect(combat.currentId).toBe(combat.combatants[0]!.id);
  });
});

describe("turn flow", () => {
  // Ordine atteso: c (15), a (12), b (8)
  const base = () => combatOf(c("a", 10, 0), c("b", 3, 1), c("c", 15, 2));

  it("startCombat sets round 1, clears acted and selects the first in order", () => {
    const combat = startCombat({ ...base(), combatants: base().combatants.map((x) => ({ ...x, acted: true })) }, getMod);
    expect(combat.active).toBe(true);
    expect(combat.round).toBe(1);
    expect(combat.currentId).toBe("c");
    expect(combat.combatants.every((x) => !x.acted)).toBe(true);
  });

  it("startCombat throws without combatants", () => {
    expect(() => startCombat(emptyCombat(), getMod)).toThrow();
  });

  it("nextTurn marks the current as acted and advances in order", () => {
    let combat = startCombat(base(), getMod);
    combat = nextTurn(combat, getMod);
    expect(combat.currentId).toBe("a");
    expect(combat.combatants.find((x) => x.id === "c")!.acted).toBe(true);
    combat = nextTurn(combat, getMod);
    expect(combat.currentId).toBe("b");
    expect(combat.round).toBe(1);
  });

  it("nextTurn after the last combatant starts a new round and resets acted", () => {
    let combat = startCombat(base(), getMod);
    combat = nextTurn(nextTurn(nextTurn(combat, getMod), getMod), getMod);
    expect(combat.round).toBe(2);
    expect(combat.currentId).toBe("c");
    expect(combat.combatants.every((x) => !x.acted)).toBe(true);
  });

  it("nextTurn skips combatants already ticked out of order", () => {
    let combat = startCombat(base(), getMod);
    combat = toggleActed(combat, "a", getMod); // a agisce prima (azione preparata)
    expect(combat.currentId).toBe("c");
    combat = nextTurn(combat, getMod);
    expect(combat.currentId).toBe("b");
  });

  it("toggleActed on the current combatant moves the turn to the next one", () => {
    let combat = startCombat(base(), getMod);
    combat = toggleActed(combat, "c", getMod);
    expect(combat.currentId).toBe("a");
  });

  it("toggleActed that ticks everyone leaves no current until nextTurn opens the new round", () => {
    let combat = startCombat(base(), getMod);
    for (const id of ["c", "a", "b"]) combat = toggleActed(combat, id, getMod);
    expect(combat.currentId).toBeNull();
    expect(combat.round).toBe(1);
    combat = nextTurn(combat, getMod);
    expect(combat.round).toBe(2);
    expect(combat.currentId).toBe("c");
  });

  it("un-ticking a combatant makes them eligible again", () => {
    let combat = startCombat(base(), getMod);
    combat = nextTurn(combat, getMod); // c acted, current a
    combat = toggleActed(combat, "c", getMod); // c un-ticked
    expect(combat.combatants.find((x) => x.id === "c")!.acted).toBe(false);
    expect(combat.currentId).toBe("c");
  });

  it("nextTurn does nothing when combat is not active", () => {
    const combat = base();
    expect(nextTurn(combat, getMod)).toBe(combat);
  });

  it("endCombat resets round, rolls and acted but keeps combatants", () => {
    let combat = nextTurn(startCombat(base(), getMod), getMod);
    combat = endCombat(combat);
    expect(combat.active).toBe(false);
    expect(combat.round).toBe(0);
    expect(combat.currentId).toBeNull();
    expect(combat.combatants).toHaveLength(3);
    expect(combat.combatants.every((x) => x.roll === null && !x.acted)).toBe(true);
  });

  it("endCombat keeps combat notes", () => {
    const combat = endCombat(setNotes(startCombat(base(), getMod), "a", "avvelenato"));
    expect(combat.combatants.find((x) => x.id === "a")!.notes).toBe("avvelenato");
  });
});

describe("manual tie ordering", () => {
  // a: 10+2 = 12, d: 10+2 = 12 (pareggio pieno), c: 15
  const tied = () => combatOf(c("a", 10, 0), c("d", 10, 1), c("c", 15, 2));

  it("canMove only between fully tied neighbours", () => {
    const combat = tied();
    expect(canMove(combat, "a", 1, getMod)).toBe(true);
    expect(canMove(combat, "d", -1, getMod)).toBe(true);
    expect(canMove(combat, "a", -1, getMod)).toBe(false); // sopra c'è c con 15
    expect(canMove(combat, "c", 1, getMod)).toBe(false);
  });

  it("moveCombatant swaps tied neighbours", () => {
    const combat = moveCombatant(tied(), "a", 1, getMod);
    expect(ids(sortCombatants(combat.combatants, getMod))).toEqual(["c", "d", "a"]);
  });

  it("moveCombatant is a no-op when not allowed", () => {
    const combat = tied();
    expect(moveCombatant(combat, "c", 1, getMod)).toBe(combat);
  });
});
