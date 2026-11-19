import { describe, expect, it } from "vitest";
import { shade } from "./shade";

describe("shade", () => {
  it("returns the same colour for 0, white for 1 and black for -1", () => {
    expect(shade("#3d7ea6", 0)).toBe("#3d7ea6");
    expect(shade("#3d7ea6", 1)).toBe("#ffffff");
    expect(shade("#3d7ea6", -1)).toBe("#000000");
  });

  it("moves each channel proportionally towards white or black", () => {
    expect(shade("#808080", 0.5)).toBe("#c0c0c0");
    expect(shade("#808080", -0.5)).toBe("#404040");
    expect(shade("#ff0000", -0.5)).toBe("#800000");
  });

  it("clamps the amount and keeps two digits per channel", () => {
    expect(shade("#010203", -3)).toBe("#000000");
    expect(shade("#000000", 0.02)).toBe("#050505");
  });
});
