import { describe, expect, it } from "vitest";
import { canPlayerMove, movePartyToken } from "../src/playerView";
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
