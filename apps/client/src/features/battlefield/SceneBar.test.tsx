import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newScene, type MapElement } from "@vtt/shared";
import { api } from "../../api/http";
import { editScene, useHistoryStore } from "../../store/historyStore";
import { useSceneStore } from "../../store/sceneStore";
import { emptyHistory } from "./history";
import { useUndoShortcuts } from "./hooks";
import { SceneBar } from "./SceneBar";

vi.mock("../../api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/http")>()),
  api: { scenes: { update: vi.fn(async (doc: unknown) => ({ status: "ok", rev: 2, data: doc })) } },
}));

const scene = { ...newScene("Cripta"), id: "s1" };
const wall: MapElement = { id: "w1", type: "wall", x: 2, y: 2, w: 1, h: 4, rotation: 0, color: "#4b5563" };

beforeEach(() => {
  vi.clearAllMocks();
  useSceneStore.getState().hydrate([
    { rev: 1, data: scene },
    { rev: 1, data: { ...newScene("Strada"), id: "s2" } },
  ]);
  useSceneStore.getState().select("s1");
  useHistoryStore.setState(emptyHistory("s1"), true);
});

const current = () => useSceneStore.getState().scenes.find((s) => s.id === "s1")!;

/** La barra si ridisegna con la scena attuale, come nella pagina. */
function Bar() {
  const s = useSceneStore((st) => st.scenes.find((x) => x.id === st.activeId)!);
  useUndoShortcuts();
  return (
    <>
      <SceneBar scene={s} />
      <input aria-label="Nome" />
      <input type="checkbox" aria-label="Spunta" />
    </>
  );
}

const addWall = () => editScene("s1", (s) => ({ ...s, elements: [...s.elements, wall] }));
const deleteWall = () => editScene("s1", (s) => ({ ...s, elements: s.elements.filter((e) => e.id !== "w1") }));

describe("SceneBar: fog of war", () => {
  it("turns the fog on and off for the players", async () => {
    const { rerender } = render(<SceneBar scene={current()} />);
    const off = screen.getByRole("button", { name: "🌫 Nebbia di guerra: spenta" });
    expect(off).toHaveAttribute("aria-pressed", "false");
    expect(off).toHaveAttribute("title", expect.stringMatching(/vedono tutta la mappa/));

    await userEvent.click(off);
    expect(current().vision.enabled).toBe(true);
    rerender(<SceneBar scene={current()} />);
    const on = screen.getByRole("button", { name: "🌫 Nebbia di guerra" });
    expect(on).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(on);
    expect(current().vision.enabled).toBe(false);
  });
});

describe("SceneBar: undo and redo", () => {
  it("starts disabled and says what would be undone or redone", async () => {
    render(<Bar />);
    const undo = screen.getByRole("button", { name: "↶ Annulla" });
    const redo = screen.getByRole("button", { name: "↷ Ripeti" });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();

    addWall();
    deleteWall();
    await waitFor(() => expect(undo).toBeEnabled());
    expect(undo).toHaveAttribute("title", "Annulla: elimina muro (Ctrl+Z)");

    await userEvent.click(undo);
    expect(current().elements).toEqual([wall]);
    expect(undo).toHaveAttribute("title", "Annulla: aggiungi muro (Ctrl+Z)");
    expect(redo).toBeEnabled();
    expect(redo).toHaveAttribute("title", "Ripeti: elimina muro (Ctrl+Y)");

    await userEvent.click(redo);
    expect(current().elements).toEqual([]);
    expect(redo).toBeDisabled();
  });

  it("saves the state after undo on the server, like any edit", async () => {
    render(<Bar />);
    addWall();
    await waitFor(() => expect(api.scenes.update).toHaveBeenCalled());
    vi.mocked(api.scenes.update).mockClear();
    await userEvent.click(screen.getByRole("button", { name: "↶ Annulla" }));
    await waitFor(() => expect(api.scenes.update).toHaveBeenCalledWith(expect.objectContaining({ id: "s1", elements: [] }), expect.any(Number)));
  });

  it("records the fog-of-war switch but not renaming or going on air", async () => {
    render(<Bar />);
    await userEvent.click(screen.getByRole("button", { name: "🌫 Nebbia di guerra: spenta" }));
    expect(screen.getByRole("button", { name: "↶ Annulla" })).toHaveAttribute("title", "Annulla: modifica visione (Ctrl+Z)");
    await userEvent.click(screen.getByRole("button", { name: "📺 Mostra ai giocatori" }));
    expect(useHistoryStore.getState().undo).toHaveLength(1);
  });

  it("Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo", async () => {
    render(<Bar />);
    addWall();
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(current().elements).toEqual([]);
    await userEvent.keyboard("{Control>}y{/Control}");
    expect(current().elements).toEqual([wall]);
    await userEvent.keyboard("{Control>}z{/Control}");
    await userEvent.keyboard("{Control>}{Shift>}Z{/Shift}{/Control}");
    expect(current().elements).toEqual([wall]);
  });

  it("does not fire while typing in a text field, but does after ticking a checkbox", async () => {
    render(<Bar />);
    addWall();
    await userEvent.click(screen.getByRole("textbox", { name: "Nome" }));
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(current().elements).toEqual([wall]);

    await userEvent.click(screen.getByRole("checkbox", { name: "Spunta" }));
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(current().elements).toEqual([]);
  });

  it("starts over when the active scene changes", async () => {
    render(<Bar />);
    addWall();
    await waitFor(() => expect(screen.getByRole("button", { name: "↶ Annulla" })).toBeEnabled());
    useSceneStore.getState().select("s2");
    await waitFor(() => expect(screen.getByRole("button", { name: "↶ Annulla" })).toBeDisabled());
    useSceneStore.getState().select("s1");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Scena attiva" })).toHaveValue("s1"));
    expect(screen.getByRole("button", { name: "↶ Annulla" })).toBeDisabled();
    expect(current().elements).toEqual([wall]);
  });
});
