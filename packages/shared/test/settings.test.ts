import { describe, expect, it } from "vitest";
import { SettingsSchema, defaultPlayerViewSettings, playerSeesHp } from "../src/schemas/settings";

describe("player view settings", () => {
  it("hide everything by default, also for settings saved before they existed", () => {
    expect(SettingsSchema.parse({ logoUrl: null }).playerView).toEqual({ showInitiative: false, showNpcHp: false, showPartyHp: false });
    expect(SettingsSchema.parse({ logoUrl: null, playerView: { showInitiative: true } }).playerView).toEqual({ showInitiative: true, showNpcHp: false, showPartyHp: false });
  });

  it("show the HP of PCs and NPCs separately", () => {
    const view = { ...defaultPlayerViewSettings(), showPartyHp: true };
    expect(playerSeesHp(view, { kind: "pc" })).toBe(true);
    expect(playerSeesHp(view, { kind: "npc" })).toBe(false);
    expect(playerSeesHp({ ...view, showNpcHp: true }, { kind: "npc" })).toBe(true);
  });
});
