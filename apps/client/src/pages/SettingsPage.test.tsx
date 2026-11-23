import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "@vtt/shared";
import { api } from "../api/http";
import { useSettingsStore } from "../store/settingsStore";
import { SettingsPage } from "./SettingsPage";

vi.mock("../api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/http")>()),
  api: { settings: { put: vi.fn(async (doc: unknown, rev: number) => ({ status: "ok", rev: rev + 1, data: doc })) } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  useSettingsStore.getState().hydrate({ rev: 0, data: defaultSettings() });
});

describe("SettingsPage", () => {
  it("starts with everything hidden from the players", () => {
    render(<SettingsPage />);
    for (const name of [/Mostra l'iniziativa/, /Mostra la vita dei PNG/, /Mostra la vita del party/]) {
      expect(screen.getByRole("checkbox", { name })).not.toBeChecked();
    }
  });

  it("saves each choice on the server", async () => {
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Mostra la vita dei PNG/ }));
    expect(screen.getByRole("checkbox", { name: /Mostra la vita dei PNG/ })).toBeChecked();
    expect(useSettingsStore.getState().settings.playerView).toEqual({ showInitiative: false, showNpcHp: true, showPartyHp: false });
    await waitFor(() =>
      expect(api.settings.put).toHaveBeenCalledWith({ logoUrl: null, playerView: { showInitiative: false, showNpcHp: true, showPartyHp: false } }, 0),
    );
  });
});
