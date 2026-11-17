import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newHandout } from "@vtt/shared";
import { handoutSync, useLibraryStore } from "../store/libraryStore";
import { useSceneStore } from "../store/sceneStore";
import { HandoutsPage } from "./HandoutsPage";
import { PlayerViewPage } from "./PlayerViewPage";

vi.mock("../api/http", async (importOriginal) => {
  let rev = 1;
  const col = {
    list: vi.fn(async () => []),
    create: vi.fn(async (doc: unknown) => ({ rev: 1, data: doc })),
    update: vi.fn(async () => ({ status: "ok", rev: ++rev })),
    remove: vi.fn(async () => undefined),
  };
  return {
    ...(await importOriginal<typeof import("../api/http")>()),
    api: { handouts: col, upload: vi.fn(async () => ({ url: "/uploads/lettera.png" })) },
  };
});

beforeEach(() => {
  handoutSync.hydrate([]);
  useSceneStore.getState().hydrate([]);
  vi.stubGlobal("confirm", () => true);
});

describe("HandoutsPage", () => {
  it("uploads an image with a title and shows it to the players", async () => {
    render(<HandoutsPage />);
    const form = screen.getByRole("form", { name: "Nuovo handout" });
    const upload = within(form).getByRole("button", { name: "Carica" });
    expect(upload).toBeDisabled();
    await userEvent.type(within(form).getByLabelText("Titolo"), "Lettera del barone");
    await userEvent.upload(within(form).getByLabelText("Immagine"), new File(["x"], "lettera.png", { type: "image/png" }));
    await userEvent.click(upload);

    const item = await screen.findByRole("img", { name: "Lettera del barone" });
    expect(item).toHaveAttribute("src", "/uploads/lettera.png");
    expect(screen.getByText(/Nessun handout a schermo/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Mostra ai giocatori" }));
    expect(screen.getByRole("status")).toHaveTextContent("I giocatori vedono a schermo intero: Lettera del barone");
    expect(useLibraryStore.getState().handouts[0]!.shownAt).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Torna alla mappa" }));
    expect(screen.getByRole("status")).toHaveTextContent("Nessun handout a schermo");
    expect(useLibraryStore.getState().handouts[0]!.shownAt).toBeNull();
  });

  it("shows one handout at a time", async () => {
    handoutSync.hydrate([
      { rev: 1, data: { ...newHandout("Mappa", "/uploads/a.png", new Date("2026-01-01T10:00:00Z")), id: "a" } },
      { rev: 1, data: { ...newHandout("Ritratto", "/uploads/b.png", new Date("2026-01-01T11:00:00Z")), id: "b" } },
    ]);
    render(<HandoutsPage />);
    const items = screen.getAllByRole("listitem");
    await userEvent.click(within(items[1]!).getByRole("button", { name: "Mostra ai giocatori" })); // Mappa (la più vecchia, in fondo)
    await userEvent.click(within(items[0]!).getByRole("button", { name: "Mostra ai giocatori" })); // Ritratto
    const shown = useLibraryStore.getState().handouts.filter((h) => h.shownAt);
    expect(shown.map((h) => h.title)).toEqual(["Ritratto"]);
    expect(within(items[0]!).getByRole("button", { name: "Nascondi ai giocatori" })).toBeInTheDocument();
  });

  it("deletes a handout after confirmation", async () => {
    handoutSync.hydrate([{ rev: 1, data: { ...newHandout("Mappa", "/uploads/a.png"), id: "a" } }]);
    render(<HandoutsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Elimina Mappa" }));
    expect(useLibraryStore.getState().handouts).toEqual([]);
  });
});

describe("PlayerViewPage: handout", () => {
  it("covers the screen with the shown handout, and goes back when the master hides it", () => {
    const handout = { ...newHandout("Lettera", "/uploads/l.png"), id: "h", shownAt: "2026-01-01T10:00:00.000Z" };
    handoutSync.hydrate([{ rev: 1, data: handout }]);
    render(<PlayerViewPage />);
    const figure = screen.getByRole("figure", { name: "Handout: Lettera" });
    expect(within(figure).getByRole("img", { name: "Lettera" })).toHaveAttribute("src", "/uploads/l.png");
    expect(within(figure).getByText("Lettera")).toBeInTheDocument();

    act(() => handoutSync.hydrate([{ rev: 2, data: { ...handout, shownAt: null } }]));
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
  });
});
