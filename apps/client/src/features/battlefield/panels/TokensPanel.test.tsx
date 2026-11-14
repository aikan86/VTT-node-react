import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCombat, newCharacter, newScene, type Ref, type Scene } from "@vtt/shared";
import { useCombatStore } from "../../../store/combatStore";
import { usePartyStore } from "../../../store/partyStore";
import type { EntityView } from "../../../store/entities";
import { TokensPanel } from "./TokensPanel";

vi.mock("../../../api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/http")>()),
  api: {},
}));

const aria = newCharacter({ id: "pc-a", name: "Aria" });
const borin = newCharacter({ id: "pc-b", name: "Borin" });
const NAMES: Record<string, string> = { "pc-a": "Aria", "pc-b": "Borin", "pc-c": "Cael", "n1": "Goblin" };
const resolve = (ref: Ref) =>
  ({ ref, name: NAMES[ref.id] ?? ref.id, color: "#3b82f6", hp: aria.hp, ac: 15, initiativeMod: 0, size: 1 }) satisfies EntityView;

function sceneWithAria(locked = false): Scene {
  const scene = newScene("Test");
  return {
    ...scene,
    layers: { ...scene.layers, tokens: { ...scene.layers.tokens, locked } },
    tokens: [{ id: "t1", ref: { kind: "pc", id: "pc-a" }, x: 0, y: 0 }],
  };
}

function renderPanel(scene: Scene, onRemoveFromMap = vi.fn()) {
  render(
    <TokensPanel
      scene={scene}
      resolve={resolve}
      pending={null}
      onPending={vi.fn()}
      onAddNpc={vi.fn()}
      selected={undefined}
      onRemoveToken={vi.fn()}
      onRemoveFromMap={onRemoveFromMap}
      onAddToInitiative={vi.fn()}
    />,
  );
  return onRemoveFromMap;
}

beforeEach(() => {
  usePartyStore.getState().hydrate([
    { rev: 1, data: aria },
    { rev: 1, data: borin },
  ]);
  useCombatStore.getState().hydrate({ rev: 0, data: emptyCombat() });
});

describe("TokensPanel", () => {
  it("lists characters in initiative order, the add button first and those outside the initiative last", () => {
    const cael = newCharacter({ id: "pc-c", name: "Cael" });
    usePartyStore.getState().hydrate([aria, borin, cael].map((data) => ({ rev: 1, data })));
    const goblin = { id: "n1", name: "Goblin", color: "#ff0000", hp: { current: 7, max: 7, temp: 0 }, ac: 15, initiativeMod: 0, size: 1 };
    useCombatStore.getState().hydrate({
      rev: 1,
      data: {
        ...emptyCombat(),
        npcs: [goblin],
        combatants: [
          { id: "c1", ref: { kind: "pc", id: "pc-a" }, roll: 5, acted: false, order: 0, notes: "" },
          { id: "c2", ref: { kind: "npc", id: "n1" }, roll: 18, acted: false, order: 1, notes: "" },
          { id: "c3", ref: { kind: "pc", id: "pc-b" }, roll: 12, acted: false, order: 2, notes: "" },
        ],
      },
    });
    renderPanel(sceneWithAria());
    const list = screen.getByRole("list", { name: "Personaggi" });
    expect(within(list).getAllByRole("listitem").map((li) => within(li).getByTestId("entity-name").textContent)).toEqual([
      "Goblin",
      "Borin",
      "Aria",
      "Cael",
    ]);
    const add = screen.getByRole("button", { name: "+ Aggiungi PNG" });
    expect(add.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("highlights the combatant whose turn it is, as in the initiative tracker", () => {
    const combatants = [
      { id: "c1", ref: { kind: "pc" as const, id: "pc-a" }, roll: 15, acted: true, order: 0, notes: "" },
      { id: "c2", ref: { kind: "pc" as const, id: "pc-b" }, roll: 10, acted: false, order: 1, notes: "" },
    ];
    useCombatStore.getState().hydrate({ rev: 1, data: { ...emptyCombat(), active: true, round: 1, currentId: "c2", combatants } });
    renderPanel(sceneWithAria());
    const items = within(screen.getByRole("list", { name: "Personaggi" })).getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(within(items[1]!).getByText("◀ turno")).toBeInTheDocument();
    expect(items[0]).not.toHaveAttribute("aria-current");
  });

  it("highlights nobody when combat is not running", () => {
    const combatants = [{ id: "c1", ref: { kind: "pc" as const, id: "pc-a" }, roll: 15, acted: false, order: 0, notes: "" }];
    useCombatStore.getState().hydrate({ rev: 1, data: { ...emptyCombat(), currentId: "c1", combatants } });
    renderPanel(sceneWithAria());
    expect(screen.queryByText("◀ turno")).not.toBeInTheDocument();
  });

  it("offers a remove-from-map button only for entities on the map", async () => {
    const onRemove = renderPanel(sceneWithAria());
    expect(screen.queryByRole("button", { name: "Rimuovi Borin dalla mappa" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rimuovi Aria dalla mappa" }));
    expect(onRemove).toHaveBeenCalledWith({ kind: "pc", id: "pc-a" });
  });

  it("disables the button when the tokens layer is locked", () => {
    renderPanel(sceneWithAria(true));
    expect(screen.getByRole("button", { name: "Rimuovi Aria dalla mappa" })).toBeDisabled();
  });
});
