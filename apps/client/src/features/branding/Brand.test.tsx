import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/http";
import { useSettingsStore } from "../../store/settingsStore";
import { Brand } from "./Brand";

vi.mock("../../api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/http")>()),
  api: {
    settings: { put: vi.fn(async (doc: unknown, rev: number) => ({ status: "ok", rev: rev + 1, data: doc })) },
    upload: vi.fn(async () => ({ url: "/uploads/drago.png" })),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  useSettingsStore.getState().hydrate({ rev: 0, data: { logoUrl: null } });
});

const logo = () => screen.getByRole("img", { name: "Logo" });

describe("Brand", () => {
  it("shows the default logo until another one is chosen", () => {
    render(<Brand />);
    expect(logo().getAttribute("src")).toMatch(/logo-default/);
  });

  it("uploads a new logo, saves it on the server and can go back to the default", async () => {
    render(<Brand />);
    await userEvent.click(screen.getByRole("button", { name: "Cambia il logo" }));
    expect(screen.queryByRole("menuitem", { name: "Torna al logo predefinito" })).toBeNull();

    const file = new File(["png"], "drago.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Scegli l'immagine del logo"), file);
    await waitFor(() => expect(logo()).toHaveAttribute("src", "/uploads/drago.png"));
    expect(api.upload).toHaveBeenCalledWith(file);
    await waitFor(() => expect(api.settings.put).toHaveBeenCalledWith({ logoUrl: "/uploads/drago.png" }, 0));
    expect(screen.queryByRole("menu")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Cambia il logo" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Torna al logo predefinito" }));
    expect(logo().getAttribute("src")).toMatch(/logo-default/);
    await waitFor(() => expect(api.settings.put).toHaveBeenLastCalledWith({ logoUrl: null }, 1));
  });

  it("closes the menu with Esc", async () => {
    render(<Brand />);
    await userEvent.click(screen.getByRole("button", { name: "Cambia il logo" }));
    expect(screen.getByRole("menu", { name: "Logo" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
