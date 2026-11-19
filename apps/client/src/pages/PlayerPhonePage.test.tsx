import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCombat, newCharacter, newScene } from "@vtt/shared";
import { useCombatStore } from "../store/combatStore";
import { handoutSync } from "../store/libraryStore";
import { usePartyStore } from "../store/partyStore";
import { useSceneStore } from "../store/sceneStore";
import { PlayerPhonePage } from "./PlayerPhonePage";

vi.mock("../api/http", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/http")>()), api: {} }));

const aria = newCharacter({ id: "pc-a", name: "Aria", hp: { current: 9, max: 24, temp: 3 }, ac: 16, conditions: ["prone"] });
const borin = newCharacter({ id: "pc-b", name: "Borin" });
// scena non "in onda": la mappa (Konva) non serve per questi test
const scene = { ...newScene("Cripta"), id: "s1", tokens: [{ id: "t1", ref: { kind: "pc" as const, id: "pc-a" }, x: 0, y: 0 }] };

beforeEach(() => {
  usePartyStore.getState().hydrate([aria, borin].map((data) => ({ rev: 1, data })));
  useCombatStore.getState().hydrate({ rev: 0, data: emptyCombat() });
  useSceneStore.getState().hydrate([{ rev: 1, data: scene }]);
  handoutSync.hydrate([]);
});

const combatWithTurn = (currentId: string) => ({
  ...emptyCombat(),
  active: true,
  round: 2,
  currentId,
  combatants: [
    { id: "c1", ref: { kind: "pc" as const, id: "pc-a" }, roll: 15, acted: false, order: 0, notes: "" },
    { id: "c2", ref: { kind: "pc" as const, id: "pc-b" }, roll: 10, acted: false, order: 1, notes: "" },
  ],
});

describe("PlayerPhonePage", () => {
  it("shows the player's own character at the top", () => {
    render(<PlayerPhonePage pcId="pc-a" />);
    const header = screen.getByRole("banner");
    expect(within(header).getByText("Aria")).toBeInTheDocument();
    expect(within(header).getByLabelText("Punti ferita 9 su 24, 3 temporanei")).toHaveTextContent("PF 9/24 +3");
    expect(within(header).getByText("CA 16")).toBeInTheDocument();
    expect(within(header).getByRole("img", { name: "Prono" })).toBeInTheDocument();
    expect(screen.getByText("In attesa del master…")).toBeInTheDocument();
  });

  it("tells the player when it is their turn", () => {
    useCombatStore.getState().hydrate({ rev: 1, data: combatWithTurn("c1") });
    render(<PlayerPhonePage pcId="pc-a" />);
    expect(screen.getByRole("status")).toHaveTextContent("Tocca a te!");
  });

  it("otherwise says whose turn it is and where the player stands", () => {
    useCombatStore.getState().hydrate({ rev: 1, data: combatWithTurn("c2") });
    useSceneStore.getState().hydrate([{ rev: 1, data: { ...scene, tokens: [...scene.tokens, { id: "t2", ref: { kind: "pc", id: "pc-b" }, x: 1, y: 0 }] } }]);
    render(<PlayerPhonePage pcId="pc-a" />);
    expect(screen.getByRole("status")).toHaveTextContent("Round 2 · turno di Borin");
  });

  it("explains a wrong link", () => {
    render(<PlayerPhonePage pcId="nobody" />);
    expect(screen.getByRole("heading", { name: "Personaggio non trovato" })).toBeInTheDocument();
  });
});
