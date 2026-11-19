import { describe, expect, it } from "vitest";
import { canPlayerMove, movePartyToken, ownMover, partyMover } from "../src/playerView";
import { newScene, SceneSchema, type Scene } from "../src/schemas/scene";

function scene(extra: Partial<Scene> = {}): Scene {
  return {
    ...newScene(),
    tokens: [
      { id: "aria", ref: { kind: "pc", id: "pc-a" }, x: 0, y: 0 },
      { id: "spy", ref: { kind: "pc", id: "pc-s" }, x: 1, y: 0, hidden: true },
      { id: "gob", ref: { kind: "npc", id: "n1" }, x: 5, y: 5 },
    ],
    ...extra,
  };
}

describe("canPlayerMove", () => {
  it("allows only visible player characters, when the master permits it", () => {
    const s = scene();
    expect(canPlayerMove(s, s.tokens[0]!)).toBe(true);
    expect(canPlayerMove(s, s.tokens[1]!)).toBe(false); // nascosto
    expect(canPlayerMove(s, s.tokens[2]!)).toBe(false); // PNG
    expect(canPlayerMove({ playersMoveParty: false }, s.tokens[0]!)).toBe(false);
  });
});

describe("partyMover: who moves on whose turn", () => {
  const combatants = [
    { id: "c1", ref: { kind: "pc" as const, id: "pc-a" }, roll: 15, acted: false, order: 0, notes: "" },
    { id: "c2", ref: { kind: "npc" as const, id: "n1" }, roll: 10, acted: false, order: 1, notes: "" },
  ];

  it("lets every character move outside combat", () => {
    expect(partyMover({ active: false, currentId: "c1", combatants })).toBe("any");
  });

  it("in combat only the character whose turn it is, nobody during an NPC's turn", () => {
    expect(partyMover({ active: true, currentId: "c1", combatants })).toEqual({ kind: "pc", id: "pc-a" });
    expect(partyMover({ active: true, currentId: "c2", combatants })).toBeNull();
    expect(partyMover({ active: true, currentId: null, combatants })).toBeNull();
  });

  it("is applied to the tokens", () => {
    const s = scene({ tokens: [...scene().tokens, { id: "borin", ref: { kind: "pc", id: "pc-b" }, x: 2, y: 2 }] });
    const ariaTurn = { kind: "pc" as const, id: "pc-a" };
    expect(canPlayerMove(s, s.tokens[0]!, ariaTurn)).toBe(true);
    expect(canPlayerMove(s, s.tokens[3]!, ariaTurn)).toBe(false);
    expect(canPlayerMove(s, s.tokens[0]!, null)).toBe(false);
    expect(movePartyToken(s, "borin", { x: 3, y: 3 }, ariaTurn)).toBe(s);
    expect(movePartyToken(s, "aria", { x: 3, y: 3 }, ariaTurn).tokens[0]).toMatchObject({ x: 3, y: 3 });
    expect(movePartyToken(s, "aria", { x: 3, y: 3 }, null)).toBe(s);
  });
});

describe("ownMover: the single-player view", () => {
  const aria = { kind: "pc" as const, id: "pc-a" };
  const borin = { kind: "pc" as const, id: "pc-b" };

  it("moves only its own character, and only on its turn during combat", () => {
    expect(ownMover("any", aria)).toEqual(aria);
    expect(ownMover(aria, aria)).toEqual(aria);
    expect(ownMover(borin, aria)).toBeNull();
    expect(ownMover(null, aria)).toBeNull();
  });
});

describe("movePartyToken", () => {
  it("moves a player character to the cell", () => {
    const moved = movePartyToken(scene(), "aria", { x: 3, y: -2 });
    expect(moved.tokens[0]).toMatchObject({ id: "aria", x: 3, y: -2 });
    expect(moved.tokens.slice(1)).toEqual(scene().tokens.slice(1));
  });

  it("leaves the scene untouched when the move is not allowed or changes nothing", () => {
    const s = scene();
    expect(movePartyToken(s, "gob", { x: 1, y: 1 })).toBe(s);
    expect(movePartyToken(s, "spy", { x: 1, y: 1 })).toBe(s);
    expect(movePartyToken(s, "missing", { x: 1, y: 1 })).toBe(s);
    expect(movePartyToken(s, "aria", { x: 0, y: 0 })).toBe(s);
    expect(movePartyToken(s, "aria", { x: 0.5, y: 0 })).toBe(s);
    const locked = scene({ playersMoveParty: false });
    expect(movePartyToken(locked, "aria", { x: 1, y: 1 })).toBe(locked);
  });

  it("is allowed by default, also for scenes saved before the option existed", () => {
    const { playersMoveParty, ...old } = newScene();
    expect(playersMoveParty).toBe(true);
    expect(SceneSchema.parse(old).playersMoveParty).toBe(true);
  });
});
