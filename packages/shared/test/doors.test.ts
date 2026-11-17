import { describe, expect, it } from "vitest";
import { newScene, SceneSchema, type MapElement } from "../src/schemas/scene";
import { elementBlocksSight, partyOrigins, pointInPolygon, sightSegments, toggleDoor, visibilityPolygon } from "../src/visibility";

const base = { rotation: 0, color: "#92400e" };

function sceneWithDoor(open?: boolean) {
  const s = newScene();
  s.grid = { ...s.grid, cellPx: 50, offsetX: 0, offsetY: 0 };
  // porta verticale da (100,-50) a (150,50)
  const door: MapElement = { id: "d", type: "door", x: 2, y: -1, w: 1, h: 2, ...base, ...(open === undefined ? {} : { open }) };
  s.elements = [door, { id: "w", type: "wall", x: 10, y: 0, w: 1, h: 1, ...base }];
  return s;
}

describe("elementBlocksSight", () => {
  it("blocks with walls, obstacles and closed doors only", () => {
    expect(elementBlocksSight({ type: "wall" })).toBe(true);
    expect(elementBlocksSight({ type: "obstacle" })).toBe(true);
    expect(elementBlocksSight({ type: "difficult" })).toBe(false);
    expect(elementBlocksSight({ type: "door" })).toBe(true); // senza campo: chiusa
    expect(elementBlocksSight({ type: "door", open: false })).toBe(true);
    expect(elementBlocksSight({ type: "door", open: true })).toBe(false);
  });

  it("an open flag on a non-door does not change anything", () => {
    expect(elementBlocksSight({ type: "wall", open: true })).toBe(true);
  });
});

describe("toggleDoor", () => {
  it("opens a closed door and closes it again", () => {
    const opened = toggleDoor(sceneWithDoor(), "d");
    expect(opened.elements[0]!.open).toBe(true);
    expect(toggleDoor(opened, "d").elements[0]!.open).toBe(false);
  });

  it("leaves the other elements untouched", () => {
    const s = sceneWithDoor();
    const opened = toggleDoor(s, "d");
    expect(opened.elements[1]).toBe(s.elements[1]);
  });

  it("returns the same scene for walls and unknown ids", () => {
    const s = sceneWithDoor();
    expect(toggleDoor(s, "w")).toBe(s);
    expect(toggleDoor(s, "nope")).toBe(s);
  });
});

describe("doors and the party's sight", () => {
  it("a closed door has its sides in the blocking segments, an open one does not", () => {
    expect(sightSegments(sceneWithDoor(false))).toHaveLength(8);
    expect(sightSegments(sceneWithDoor(true))).toHaveLength(4);
  });

  it("the party sees through an open door but not a closed one", () => {
    const behind = { x: 300, y: 0 };
    const closed = visibilityPolygon({ x: 0, y: 0 }, sightSegments(sceneWithDoor(false)), 1000);
    const open = visibilityPolygon({ x: 0, y: 0 }, sightSegments(sceneWithDoor(true)), 1000);
    expect(pointInPolygon(behind, closed)).toBe(false);
    expect(pointInPolygon(behind, open)).toBe(true);
  });
});

describe("scene schema: doors", () => {
  it("accepts the open flag and old elements without it", () => {
    const s = sceneWithDoor(true);
    expect(SceneSchema.parse(s).elements[0]!.open).toBe(true);
    expect(SceneSchema.parse(sceneWithDoor()).elements[0]!.open).toBeUndefined();
  });
});

describe("partyOrigins", () => {
  it("uses the centre of each player character, ignoring NPCs and unknown characters", () => {
    const s = newScene();
    s.grid = { ...s.grid, cellPx: 50, offsetX: 10, offsetY: 0 };
    s.tokens = [
      { id: "a", ref: { kind: "pc", id: "big" }, x: 1, y: 1 },
      { id: "b", ref: { kind: "npc", id: "gob" }, x: 3, y: 3 },
      { id: "c", ref: { kind: "pc", id: "missing" }, x: 5, y: 5 },
    ];
    const sizes: Record<string, number> = { big: 2, gob: 1 };
    expect(partyOrigins(s, (ref) => sizes[ref.id])).toEqual([{ x: 10 + 50 + 50, y: 50 + 50 }]);
  });
});
