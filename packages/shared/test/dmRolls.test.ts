import { describe, expect, it } from "vitest";
import { DmRollSchema, faceCounts, newDmRoll, rollMean, sortRollsByTime } from "../src";

const roll = (value: number, at: string, id = at) => ({ id, value, at });

describe("faceCounts", () => {
  it("counts every face from 1 to 20, zeros included", () => {
    const counts = faceCounts([roll(20, "a"), roll(1, "b"), roll(20, "c")]);
    expect(counts).toHaveLength(20);
    expect(counts[0]).toBe(1);
    expect(counts[19]).toBe(2);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("ignores values outside 1..20", () => {
    expect(faceCounts([roll(0, "a"), roll(21, "b"), roll(2.5, "c")]).every((n) => n === 0)).toBe(true);
  });
});

describe("rollMean", () => {
  it("is null without rolls and the arithmetic mean otherwise", () => {
    expect(rollMean([])).toBeNull();
    expect(rollMean([roll(20, "a"), roll(15, "b")])).toBe(17.5);
  });
});

describe("sortRollsByTime", () => {
  it("orders oldest first without mutating the input", () => {
    const list = [roll(3, "2026-11-13T10:00:02.000Z"), roll(5, "2026-11-13T10:00:01.000Z")];
    expect(sortRollsByTime(list).map((r) => r.value)).toEqual([5, 3]);
    expect(list[0]!.value).toBe(3);
  });
});

describe("newDmRoll", () => {
  it("creates a valid roll with id and timestamp", () => {
    const r = newDmRoll(17, new Date("2026-11-13T21:00:00.000Z"));
    expect(DmRollSchema.parse(r)).toEqual({ id: r.id, value: 17, at: "2026-11-13T21:00:00.000Z" });
  });

  it("rejects values outside 1..20", () => {
    expect(() => newDmRoll(0)).toThrow(RangeError);
    expect(() => newDmRoll(21)).toThrow(RangeError);
  });
});
