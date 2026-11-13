import { describe, expect, it } from "vitest";
import { applyDamage, applyHealing } from "../src/hp";

describe("applyDamage", () => {
  it("consumes temporary hp first", () => {
    expect(applyDamage({ current: 10, max: 10, temp: 5 }, 3)).toEqual({ current: 10, max: 10, temp: 2 });
    expect(applyDamage({ current: 10, max: 10, temp: 5 }, 8)).toEqual({ current: 7, max: 10, temp: 0 });
  });

  it("does not go below zero", () => {
    expect(applyDamage({ current: 4, max: 10, temp: 0 }, 99)).toEqual({ current: 0, max: 10, temp: 0 });
  });

  it("ignores non-positive amounts", () => {
    const hp = { current: 4, max: 10, temp: 1 };
    expect(applyDamage(hp, 0)).toEqual(hp);
    expect(applyDamage(hp, -3)).toEqual(hp);
  });
});

describe("applyHealing", () => {
  it("caps at max hp and leaves temp untouched", () => {
    expect(applyHealing({ current: 4, max: 10, temp: 2 }, 3)).toEqual({ current: 7, max: 10, temp: 2 });
    expect(applyHealing({ current: 8, max: 10, temp: 0 }, 50)).toEqual({ current: 10, max: 10, temp: 0 });
  });

  it("heals from zero", () => {
    expect(applyHealing({ current: 0, max: 10, temp: 0 }, 1)).toEqual({ current: 1, max: 10, temp: 0 });
  });
});
