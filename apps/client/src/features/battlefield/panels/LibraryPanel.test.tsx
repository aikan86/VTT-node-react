import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCombat, newScene, type LoadedScene, type SavedSceneSummary, type Scene } from "@vtt/shared";
import { api } from "../../../api/http";
import { useCombatStore } from "../../../store/combatStore";
import { usePartyStore } from "../../../store/partyStore";
import { useSceneLibraryStore } from "../../../store/sceneLibraryStore";
import { sceneSync, useSceneStore } from "../../../store/sceneStore";
import { LibraryPanel } from "./LibraryPanel";

vi.mock("../../../api/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/http")>();
  const scenes = {
    list: vi.fn(async () => []),
    create: vi.fn(async (doc: unknown) => ({ rev: 1, data: doc })),
    update: vi.fn(async () => ({ status: "ok", rev: 2 })),
    remove: vi.fn(async () => undefined),
  };
  const sceneLibrary = { list: vi.fn(), save: vi.fn(), load: vi.fn(), duplicate: vi.fn(), rename: vi.fn(), remove: vi.fn() };
  const combat = { get: vi.fn(), put: vi.fn(async () => ({ status: "ok", rev: 1 })) };
  return { ...actual, api: { ...actual.api, scenes, sceneLibrary, combat } };
});

const lib = vi.mocked(api.sceneLibrary);

const summary = (id: string, name: string, updatedAt: string, thumbnailUrl: string | null = null): SavedSceneSummary => ({
  id,
  name,
  createdAt: updatedAt,
  updatedAt,
  thumbnailUrl,
  npcCount: 0,
});

const tavern = summary("lib-1", "Taverna del Cinghiale", "2026-11-18T10:00:00.000Z", "/uploads/taverna.jpg");
const crypt = summary("lib-2", "Cripta", "2026-11-17T10:00:00.000Z");

function current(): Scene {
  return { ...newScene("Strada"), tokens: [{ id: "t-aria", ref: { kind: "pc", id: "aria" }, x: 0, y: 0 }] };
}

function open(scene = current(), props: Partial<Parameters<typeof LibraryPanel>[0]> = {}) {
  sceneSync.hydrate([{ rev: 1, data: scene }]);
  useSceneStore.setState({ activeId: scene.id });
  const handlers = { onPickStart: vi.fn(), onClearStart: vi.fn(), onClose: vi.fn() };
  render(<LibraryPanel scene={scene} pickingStart={false} {...handlers} {...props} />);
  return handlers;
}

const rows = async () => within(await screen.findByRole("list", { name: "Scene salvate" })).getAllByRole("listitem");

beforeEach(() => {
  vi.clearAllMocks();
  useSceneLibraryStore.setState({ items: [], loaded: false });
  useCombatStore.getState().hydrate({ rev: 1, data: emptyCombat() });
  usePartyStore.setState({ characters: [] });
  lib.list.mockResolvedValue([crypt, tavern]);
  vi.stubGlobal("confirm", () => true);
});

describe("LibraryPanel", () => {
  it("lists the saved scenes, most recent first, with thumbnail and date", async () => {
    open();
    const items = await rows();
    expect(items.map((li) => within(li).getByRole("strong").textContent)).toEqual(["Taverna del Cinghiale", "Cripta"]);
    expect(within(items[0]!).getByRole("img", { name: "Miniatura di Taverna del Cinghiale" })).toHaveAttribute("src", "/uploads/taverna.jpg");
    expect(within(items[1]!).getByLabelText("Senza immagine")).toBeInTheDocument();
    expect(items[0]).toHaveTextContent(/18 nov 2026/);
  });

  it("filters by name", async () => {
    open();
    await rows();
    await userEvent.type(screen.getByRole("searchbox", { name: "Cerca nella libreria" }), "cri");
    expect((await rows()).map((li) => within(li).getByRole("strong").textContent)).toEqual(["Cripta"]);
    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "drago");
    expect(screen.getByText("Nessuna scena con questo nome.")).toBeInTheDocument();
  });

  it("saves the current scene with the chosen name", async () => {
    const scene = current();
    lib.save.mockResolvedValue(summary("lib-3", "Strada di notte", "2026-11-19T10:00:00.000Z"));
    open(scene);
    await rows();
    const nameField = screen.getByLabelText("Nome nella libreria");
    expect(nameField).toHaveValue("Strada");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "Strada di notte");
    await userEvent.click(screen.getByRole("button", { name: "💾 Salva la scena corrente" }));
    expect(lib.save).toHaveBeenCalledWith({ name: "Strada di notte", scene, npcs: [] });
    expect(await screen.findByRole("status")).toHaveTextContent("Salvata “Strada di notte”.");
    expect((await rows())[0]).toHaveTextContent("Strada di notte");
  });

  it("loads a scene as the new active one, bringing the PCs along by default", async () => {
    const from = current();
    const loaded: LoadedScene = {
      scene: { ...newScene("Taverna del Cinghiale"), tokens: [{ id: "n", ref: { kind: "pc", id: "aria" }, x: 5, y: 5 }] },
      npcs: [{ id: "g-new", name: "Goblin", color: "#16a34a", hp: { current: 5, max: 5, temp: 0 }, ac: 15, initiativeMod: 1, size: 1, conditions: [] }],
    };
    lib.load.mockResolvedValue(loaded);
    open(from);
    expect(screen.getByRole("checkbox", { name: /Porta con me i PG/ })).toBeChecked();
    await userEvent.click(within((await rows())[0]!).getByRole("button", { name: "Carica Taverna del Cinghiale" }));
    expect(lib.load).toHaveBeenCalledWith("lib-1", { pcs: [{ ref: { kind: "pc", id: "aria" }, size: 1 }] });
    expect(await screen.findByRole("status")).toHaveTextContent("Caricata “Taverna del Cinghiale” come nuova scena.");
    const state = useSceneStore.getState();
    expect(state.activeId).toBe(loaded.scene.id);
    expect(state.scenes.map((s) => s.name)).toEqual(["Strada", "Taverna del Cinghiale"]);
    // i PG hanno lasciato la scena di prima; i PNG sono disponibili ma non in iniziativa
    expect(state.scenes.find((s) => s.id === from.id)!.tokens).toEqual([]);
    expect(useCombatStore.getState().combat.npcs.map((n) => n.id)).toEqual(["g-new"]);
    expect(useCombatStore.getState().combat.combatants).toEqual([]);
  });

  it("leaves the PCs where they are when unchecked", async () => {
    const from = current();
    lib.load.mockResolvedValue({ scene: newScene("Cripta"), npcs: [] });
    open(from);
    await userEvent.click(screen.getByRole("checkbox", { name: /Porta con me i PG/ }));
    await userEvent.click(within((await rows())[1]!).getByRole("button", { name: "Carica Cripta" }));
    expect(lib.load).toHaveBeenCalledWith("lib-2", { pcs: [] });
    await screen.findByRole("status");
    expect(useSceneStore.getState().scenes.find((s) => s.id === from.id)!.tokens).toHaveLength(1);
  });

  it("duplicates, renames and deletes after confirming", async () => {
    lib.duplicate.mockResolvedValue(summary("lib-4", "Cripta (copia)", "2026-11-20T10:00:00.000Z"));
    lib.rename.mockResolvedValue({ ...crypt, name: "Cripta antica" });
    lib.remove.mockResolvedValue(undefined);
    open();
    await userEvent.click(within((await rows())[1]!).getByRole("button", { name: "Duplica Cripta" }));
    expect(lib.duplicate).toHaveBeenCalledWith("lib-2");
    expect((await rows())[0]).toHaveTextContent("Cripta (copia)");

    vi.stubGlobal("prompt", () => "Cripta antica");
    await userEvent.click(screen.getByRole("button", { name: "Rinomina Cripta" }));
    expect(lib.rename).toHaveBeenCalledWith("lib-2", "Cripta antica");
    expect(await screen.findByText("Cripta antica")).toBeInTheDocument();

    vi.stubGlobal("confirm", () => false);
    await userEvent.click(screen.getByRole("button", { name: "Elimina Cripta antica" }));
    expect(lib.remove).not.toHaveBeenCalled();
    vi.stubGlobal("confirm", () => true);
    await userEvent.click(screen.getByRole("button", { name: "Elimina Cripta antica" }));
    expect(lib.remove).toHaveBeenCalledWith("lib-2");
    expect(await screen.findByRole("status")).toHaveTextContent("Eliminata “Cripta antica”.");
    expect(screen.queryByText("Cripta antica")).not.toBeInTheDocument();
  });

  it("sets and clears the PCs' starting point", async () => {
    const handlers = open({ ...current(), pcStart: { x: 4, y: 7 } });
    await rows();
    expect(screen.getByText(/Casella 4, 7/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "🚩 Imposta con un clic" }));
    expect(handlers.onPickStart).toHaveBeenCalledWith(true);
    await userEvent.click(screen.getByRole("button", { name: "Rimuovi" }));
    expect(handlers.onClearStart).toHaveBeenCalled();
  });
});
