import { describe, expect, it } from "vitest";
import { CharacterSchema, newCharacter } from "../src/schemas/character";
import { NpcSchema } from "../src/schemas/combat";
import { CONDITION_INFO, CONDITIONS, toggleCondition } from "../src/conditions";
import { cellCenter, formatCells, formatDistance, formatMove, formatNumber, measure } from "../src/measure";

const grid = { cellPx: 50, offsetX: 0, offsetY: 0, feetPerCell: 5 };

describe("measure", () => {
  it("converts pixels to feet and meters with the grid scale", () => {
    const m = measure({ x: 25, y: 25 }, { x: 325, y: 25 }, grid); // 6 caselle
    expect(m.feet).toBe(30);
    expect(m.meters).toBeCloseTo(9);
    expect(m.cells).toBe(6);
  });

  it("measures diagonals in a straight line, but counts grid moves as in 5e", () => {
    const m = measure({ x: 0, y: 0 }, { x: 150, y: 150 }, grid);
    expect(m.feet).toBeCloseTo(15 * Math.SQRT2);
    expect(m.cells).toBe(3);
  });

  it("follows the feet per cell of the grid", () => {
    expect(measure({ x: 0, y: 0 }, { x: 100, y: 0 }, { cellPx: 50, feetPerCell: 10 }).feet).toBe(20);
  });

  it("formats with the Italian decimal comma", () => {
    expect(formatNumber(7.5)).toBe("7,5");
    expect(formatNumber(30)).toBe("30");
    expect(formatNumber(21.2132)).toBe("21,2");
    expect(formatDistance({ feet: 25, meters: 7.5 })).toBe("7,5 m · 25 ft");
  });

  it("writes a movement in metres, feet and squares", () => {
    expect(formatMove(30, 5)).toBe("9 m · 30 ft · 6 caselle");
    expect(formatMove(5, 5)).toBe("1,5 m · 5 ft · 1 casella");
    expect(formatMove(25, 10)).toBe("7,5 m · 25 ft · 2,5 caselle");
    expect(formatCells(0)).toBe("0 caselle");
  });

  it("snaps to the centre of the cell", () => {
    expect(cellCenter({ x: 61, y: 149 }, { cellPx: 50, offsetX: 10, offsetY: 0 })).toEqual({ x: 85, y: 125 });
  });
});

describe("conditions", () => {
  it("toggles keeping the canonical order and no duplicates", () => {
    expect(toggleCondition(undefined, "prone")).toEqual(["prone"]);
    expect(toggleCondition(["prone"], "blinded")).toEqual(["blinded", "prone"]);
    expect(toggleCondition(["blinded", "prone"], "prone")).toEqual(["blinded"]);
  });

  it("has a label and an icon for each condition", () => {
    for (const c of CONDITIONS) {
      expect(CONDITION_INFO[c].label).toBeTruthy();
      expect(CONDITION_INFO[c].icon).toBeTruthy();
    }
  });

  it("are optional on characters and NPCs, and validated", () => {
    expect(CharacterSchema.parse(newCharacter()).conditions).toBeUndefined();
    expect(CharacterSchema.safeParse(newCharacter({ conditions: ["stunned"] })).success).toBe(true);
    expect(CharacterSchema.safeParse({ ...newCharacter(), conditions: ["sleepy"] }).success).toBe(false);
    const npc = { id: "n", name: "Goblin", color: "#ff0000", hp: { current: 7, max: 7, temp: 0 }, ac: 15, initiativeMod: 2 };
    expect(NpcSchema.parse({ ...npc, conditions: ["prone"] }).conditions).toEqual(["prone"]);
  });
});
