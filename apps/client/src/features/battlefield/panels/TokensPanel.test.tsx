import { render, screen } from "@testing-library/react";
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
const resolve = (ref: Ref) =>
  ({ ref, name: ref.id === "pc-a" ? "Aria" : "Borin", color: "#3b82f6", hp: aria.hp, ac: 15, initiativeMod: 0, size: 1 }) satisfies EntityView;

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
