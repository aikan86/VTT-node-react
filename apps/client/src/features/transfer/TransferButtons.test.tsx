import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/http";
import { useStatusStore } from "../../store/statusStore";
import { TransferButtons } from "./TransferButtons";

vi.mock("../../store/partyStore", () => ({ flushParty: vi.fn(async () => {}) }));
vi.mock("../../store/combatStore", () => ({ flushCombat: vi.fn(async () => {}) }));
vi.mock("../../store/sceneStore", () => ({ flushScenes: vi.fn(async () => {}) }));

const file = () => new File(['{"format":"vtt-export"}'], "sessione.json", { type: "application/json" });
const reload = vi.fn();

beforeEach(() => {
  vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload });
  useStatusStore.getState().dismiss();
});

afterEach(() => vi.restoreAllMocks());

describe("TransferButtons", () => {
  it("exports by downloading the state file", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<TransferButtons />);
    await userEvent.click(screen.getByRole("button", { name: /Esporta/ }));
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.contexts[0] as HTMLAnchorElement).getAttribute("href")).toBe(api.exportUrl);
  });

  it("imports the chosen file after confirmation, then reloads", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const importState = vi.spyOn(api, "importState").mockResolvedValue();
    render(<TransferButtons />);
    const chosen = file();
    await userEvent.upload(screen.getByLabelText(/Importa/), chosen);
    expect(importState).toHaveBeenCalledWith(chosen);
    expect(reload).toHaveBeenCalled();
  });

  it("does nothing if the user cancels the confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const importState = vi.spyOn(api, "importState");
    render(<TransferButtons />);
    await userEvent.upload(screen.getByLabelText(/Importa/), file());
    expect(importState).not.toHaveBeenCalled();
  });

  it("reports a rejected file without reloading", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(api, "importState").mockRejectedValue(new Error("File non valido"));
    render(<TransferButtons />);
    await userEvent.upload(screen.getByLabelText(/Importa/), file());
    expect(useStatusStore.getState().error).toBe("File non valido");
    expect(reload).not.toHaveBeenCalled();
  });
});
