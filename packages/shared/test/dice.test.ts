import { describe, expect, it } from "vitest";
import { rollD20, rollDie } from "../src/dice";

describe("rollDie", () => {
  it("maps rng 0 to 1 and rng ~1 to max", () => {
    expect(rollDie(20, () => 0)).toBe(1);
    expect(rollDie(20, () => 0.9999999)).toBe(20);
    expect(rollDie(6, () => 0.5)).toBe(4);
  });

  it("always stays within range with the real rng", () => {
    for (let i = 0; i < 2000; i++) {
      const r = rollD20();
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(20);
      expect(Number.isInteger(r)).toBe(true);
    }
  });

  it("rejects invalid die sizes", () => {
    expect(() => rollDie(0)).toThrow(RangeError);
    expect(() => rollDie(2.5)).toThrow(RangeError);
  });
});
