import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCombat, newCharacter, newScene, type Condition, type NpcGroup, type Ref, type Scene, type Token } from "@vtt/shared";
import { npcGroupSync } from "../../../store/libraryStore";
import { setEntityConditions } from "../../../store/actions";
import { useCombatStore } from "../../../store/combatStore";
import { usePartyStore } from "../../../store/partyStore";
import type { EntityView } from "../../../store/entities";
import { TokensPanel } from "./TokensPanel";

vi.mock("../../../api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/http")>()),
  api: {},
}));

vi.mock("../../../store/actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../store/actions")>()),
  setEntityConditions: vi.fn(),
}));

const aria = newCharacter({ id: "pc-a", name: "Aria" });
const borin = newCharacter({ id: "pc-b", name: "Borin" });
const NAMES: Record<string, string> = { "pc-a": "Aria", "pc-b": "Borin", "pc-c": "Cael", "n1": "Goblin" };
/** Condizioni restituite dal resolver nei test. */
let conditionsOf: Record<string, Condition[]> = {};
const resolve = (ref: Ref) =>
  ({ ref, name: NAMES[ref.id] ?? ref.id, color: "#3b82f6", hp: aria.hp, ac: 15, initiativeMod: 0, size: 1, conditions: conditionsOf[ref.id] ?? [] }) satisfies EntityView;

function sceneWithAria(locked = false): Scene {
  const scene = newScene("Test");
  return {
    ...scene,
    layers: { ...scene.layers, tokens: { ...scene.layers.tokens, locked } },
    tokens: [{ id: "t1", ref: { kind: "pc", id: "pc-a" }, x: 0, y: 0 }],
  };
}

interface PanelOptions {
  selected?: Token;
  onChangeToken?: (token: Token) => void;
  pending?: Ref[] | null;
  onSetHidden?: (ref: Ref, hidden: boolean) => void;
  onSetNpcsHidden?: (hidden: boolean) => void;
  placeHidden?: boolean;
  onPlaceHidden?: (hidden: boolean) => void;
  showMovement?: boolean;
  onShowMovement?: (show: boolean) => void;
  onPlayersMoveParty?: (allowed: boolean) => void;
  onPlaceGroup?: (group: NpcGroup) => void;
}

function renderPanel(scene: Scene, onRemoveFromMap = vi.fn(), options: PanelOptions = {}) {
  render(
    <TokensPanel
      scene={scene}
      resolve={resolve}
      pending={options.pending ?? null}
      onPending={vi.fn()}
      onAddNpc={vi.fn()}
      selected={options.selected}
      onChangeToken={options.onChangeToken ?? vi.fn()}
      onRemoveToken={vi.fn()}
      onRemoveFromMap={onRemoveFromMap}
      onAddToInitiative={vi.fn()}
      onSetHidden={options.onSetHidden ?? vi.fn()}
      onSetNpcsHidden={options.onSetNpcsHidden ?? vi.fn()}
      placeHidden={options.placeHidden ?? false}
      onPlaceHidden={options.onPlaceHidden ?? vi.fn()}
      showMovement={options.showMovement ?? true}
      onShowMovement={options.onShowMovement ?? vi.fn()}
      onPlayersMoveParty={options.onPlayersMoveParty ?? vi.fn()}
      onPlaceGroup={options.onPlaceGroup ?? vi.fn()}
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
  conditionsOf = {};
  vi.mocked(setEntityConditions).mockClear();
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

describe("TokensPanel: visibility to players", () => {
  const token = (hidden?: boolean): Token => ({ id: "t1", ref: { kind: "pc", id: "pc-a" }, x: 0, y: 0, ...(hidden === undefined ? {} : { hidden }) });
  const sceneWith = (t: Token, locked = false): Scene => ({ ...sceneWithAria(locked), tokens: [t] });

  it("lets the master hide the selected token from the players", async () => {
    const onChangeToken = vi.fn();
    const t = token();
    renderPanel(sceneWith(t), vi.fn(), { selected: t, onChangeToken });
    const checkbox = screen.getByRole("checkbox", { name: "Visibile ai giocatori (H)" });
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(onChangeToken).toHaveBeenCalledWith({ ...t, hidden: true });
  });

  it("shows a hidden token as such, and can make it visible again", async () => {
    const onChangeToken = vi.fn();
    const t = token(true);
    renderPanel(sceneWith(t), vi.fn(), { selected: t, onChangeToken });
    const list = screen.getByRole("list", { name: "Personaggi" });
    expect(within(list).getByText("nascosto")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox", { name: "Visibile ai giocatori (H)" });
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(onChangeToken).toHaveBeenCalledWith({ ...t, hidden: false });
  });

  it("does not flag visible tokens, and disables the toggle when the layer is locked", () => {
    const t = token();
    renderPanel(sceneWith(t, true), vi.fn(), { selected: t });
    expect(screen.queryByText("nascosto")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Visibile ai giocatori (H)" })).toBeDisabled();
  });
});

describe("TokensPanel: quick hide from the list", () => {
  const goblin = { id: "n1", name: "Goblin", color: "#ff0000", hp: { current: 7, max: 7, temp: 0 }, ac: 15, initiativeMod: 0, size: 1 };
  const goblinRef: Ref = { kind: "npc", id: "n1" };
  const ariaRef: Ref = { kind: "pc", id: "pc-a" };
  const withGoblin = (hidden?: boolean): Scene => {
    useCombatStore.getState().hydrate({ rev: 0, data: { ...emptyCombat(), npcs: [goblin] } });
    const scene = sceneWithAria();
    return { ...scene, tokens: [...scene.tokens, { id: "t2", ref: goblinRef, x: 1, y: 0, ...(hidden === undefined ? {} : { hidden }) }] };
  };

  it("hides and shows a character without selecting its token", async () => {
    const onSetHidden = vi.fn();
    renderPanel(sceneWithAria(), vi.fn(), { onSetHidden });
    await userEvent.click(screen.getByRole("button", { name: "Nascondi Aria ai giocatori" }));
    expect(onSetHidden).toHaveBeenCalledWith(ariaRef, true);
  });

  it("offers to show a hidden character again", async () => {
    const onSetHidden = vi.fn();
    const scene = { ...sceneWithAria(), tokens: [{ id: "t1", ref: ariaRef, x: 0, y: 0, hidden: true }] };
    renderPanel(scene, vi.fn(), { onSetHidden });
    const eye = screen.getByRole("button", { name: "Mostra Aria ai giocatori" });
    expect(eye).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(eye);
    expect(onSetHidden).toHaveBeenCalledWith(ariaRef, false);
  });

  it("has no eye for characters that are not on the map", () => {
    renderPanel(sceneWithAria());
    expect(screen.queryByRole("button", { name: /Borin ai giocatori/ })).not.toBeInTheDocument();
  });

  it("hides every NPC at once, and shows them again", async () => {
    const onSetNpcsHidden = vi.fn();
    renderPanel(withGoblin(), vi.fn(), { onSetNpcsHidden });
    expect(screen.queryByRole("button", { name: "Mostra tutti i PNG ai giocatori" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Nascondi tutti i PNG ai giocatori" }));
    expect(onSetNpcsHidden).toHaveBeenCalledWith(true);
  });

  it("offers to show all NPCs when they are hidden", async () => {
    const onSetNpcsHidden = vi.fn();
    renderPanel(withGoblin(true), vi.fn(), { onSetNpcsHidden });
    expect(screen.queryByRole("button", { name: "Nascondi tutti i PNG ai giocatori" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mostra tutti i PNG ai giocatori" }));
    expect(onSetNpcsHidden).toHaveBeenCalledWith(false);
  });

  it("shows no bulk buttons when no NPC is on the map", () => {
    useCombatStore.getState().hydrate({ rev: 0, data: { ...emptyCombat(), npcs: [goblin] } });
    renderPanel(sceneWithAria());
    expect(screen.queryByRole("button", { name: /tutti i PNG ai giocatori/ })).not.toBeInTheDocument();
  });

  it("lets the master place tokens already hidden", async () => {
    const onPlaceHidden = vi.fn();
    renderPanel(sceneWithAria(), vi.fn(), { pending: [{ kind: "pc", id: "pc-b" }], onPlaceHidden });
    const checkbox = screen.getByRole("checkbox", { name: "Piazza nascosti ai giocatori" });
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(onPlaceHidden).toHaveBeenCalledWith(true);
  });

  it("only asks about hidden placement while placing", () => {
    renderPanel(sceneWithAria());
    expect(screen.queryByRole("checkbox", { name: "Piazza nascosti ai giocatori" })).not.toBeInTheDocument();
  });

  it("disables the eye and the bulk buttons when the layer is locked", () => {
    const scene = { ...withGoblin(), layers: { ...sceneWithAria().layers, tokens: { ...sceneWithAria().layers.tokens, locked: true } } };
    renderPanel(scene);
    expect(screen.getByRole("button", { name: "Nascondi Aria ai giocatori" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Nascondi tutti i PNG ai giocatori" })).toBeDisabled();
  });
});

describe("TokensPanel: darkvision", () => {
  const ariaToken: Token = { id: "t1", ref: { kind: "pc", id: "pc-a" }, x: 0, y: 0 };

  it("sets the darkvision of the selected character in feet", async () => {
    const onChangeToken = vi.fn();
    renderPanel(sceneWithAria(), vi.fn(), { selected: ariaToken, onChangeToken });
    const field = screen.getByRole("textbox", { name: "Scurovisione (ft)" });
    expect(field).toHaveValue("0");
    await userEvent.clear(field);
    await userEvent.type(field, "60");
    expect(onChangeToken).toHaveBeenLastCalledWith({ ...ariaToken, darkvisionFt: 60 });
  });

  it("removes the field from the token when set back to 0", async () => {
    const onChangeToken = vi.fn();
    const t = { ...ariaToken, darkvisionFt: 60 };
    renderPanel({ ...sceneWithAria(), tokens: [t] }, vi.fn(), { selected: t, onChangeToken });
    const field = screen.getByRole("textbox", { name: "Scurovisione (ft)" });
    expect(field).toHaveValue("60");
    await userEvent.clear(field);
    await userEvent.type(field, "0");
    expect(onChangeToken).toHaveBeenLastCalledWith({ ...ariaToken, darkvisionFt: undefined });
  });

  it("is only offered for player characters, and locked with the layer", () => {
    const goblin: Token = { id: "t2", ref: { kind: "npc", id: "n1" }, x: 1, y: 0 };
    renderPanel({ ...sceneWithAria(), tokens: [goblin] }, vi.fn(), { selected: goblin });
    expect(screen.queryByRole("textbox", { name: "Scurovisione (ft)" })).not.toBeInTheDocument();
  });

  it("is disabled when the tokens layer is locked", () => {
    renderPanel(sceneWithAria(true), vi.fn(), { selected: ariaToken });
    expect(screen.getByRole("textbox", { name: "Scurovisione (ft)" })).toBeDisabled();
  });
});

describe("TokensPanel: speed and movement range", () => {
  const ariaToken: Token = { id: "t1", ref: { kind: "pc", id: "pc-a" }, x: 0, y: 0 };

  it("shows the default speed and saves a different one", async () => {
    const onChangeToken = vi.fn();
    renderPanel(sceneWithAria(), vi.fn(), { selected: ariaToken, onChangeToken });
    const field = screen.getByRole("textbox", { name: "Velocità (ft)" });
    expect(field).toHaveValue("30");
    await userEvent.clear(field);
    await userEvent.type(field, "25");
    expect(onChangeToken).toHaveBeenLastCalledWith({ ...ariaToken, speedFt: 25 });
  });

  it("is offered for NPCs too", () => {
    const goblin: Token = { id: "t2", ref: { kind: "npc", id: "n1" }, x: 1, y: 0, speedFt: 40 };
    renderPanel({ ...sceneWithAria(), tokens: [goblin] }, vi.fn(), { selected: goblin });
    expect(screen.getByRole("textbox", { name: "Velocità (ft)" })).toHaveValue("40");
    expect(screen.getByTestId("speed-summary")).toHaveTextContent("12 m · 40 ft · 8 caselle");
    expect(screen.getByText(/raggiungibili con 12 m · 40 ft · 8 caselle; più chiaro: con uno scatto \(24 m · 80 ft · 16 caselle\)/)).toBeInTheDocument();
  });

  it("toggles the movement range", async () => {
    const onShowMovement = vi.fn();
    renderPanel(sceneWithAria(), vi.fn(), { selected: ariaToken, showMovement: false, onShowMovement });
    const box = screen.getByRole("checkbox", { name: "Mostra raggio di movimento" });
    expect(box).not.toBeChecked();
    expect(screen.queryByText(/terreno difficile costa il doppio/i)).not.toBeInTheDocument();
    await userEvent.click(box);
    expect(onShowMovement).toHaveBeenCalledWith(true);
  });
});

describe("TokensPanel: conditions", () => {
  const ariaToken: Token = { id: "t1", ref: { kind: "pc", id: "pc-a" }, x: 0, y: 0 };

  it("toggles conditions of the selected character", async () => {
    conditionsOf = { "pc-a": ["prone"] };
    renderPanel(sceneWithAria(), vi.fn(), { selected: ariaToken });
    const picker = screen.getByRole("group", { name: "Condizioni di Aria" });
    expect(within(picker).getByRole("button", { name: /Prono/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(picker).getByRole("button", { name: /Accecato/ })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(within(picker).getByRole("button", { name: /Accecato/ }));
    expect(setEntityConditions).toHaveBeenCalledWith({ kind: "pc", id: "pc-a" }, ["blinded", "prone"]);
    await userEvent.click(within(picker).getByRole("button", { name: /Prono/ }));
    expect(setEntityConditions).toHaveBeenLastCalledWith({ kind: "pc", id: "pc-a" }, []);
  });

  it("shows condition icons next to the name in the list", () => {
    conditionsOf = { "pc-a": ["stunned", "poisoned"] };
    renderPanel(sceneWithAria());
    const list = screen.getByRole("list", { name: "Personaggi" });
    expect(within(list).getByRole("img", { name: "Stordito" })).toHaveTextContent("💫");
    expect(within(list).getByRole("img", { name: "Avvelenato" })).toBeInTheDocument();
    expect(within(list).getAllByTestId("condition-icons")).toHaveLength(1);
  });
});

describe("TokensPanel: players moving the party", () => {
  it("is allowed by default and can be turned off", async () => {
    const onPlayersMoveParty = vi.fn();
    renderPanel(sceneWithAria(), vi.fn(), { onPlayersMoveParty });
    const box = screen.getByRole("checkbox", { name: "I giocatori possono muovere i PG dalla loro vista" });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(onPlayersMoveParty).toHaveBeenCalledWith(false);
  });

  it("shows when the master has forbidden it", () => {
    renderPanel({ ...sceneWithAria(), playersMoveParty: false });
    expect(screen.getByRole("checkbox", { name: "I giocatori possono muovere i PG dalla loro vista" })).not.toBeChecked();
  });
});

describe("TokensPanel: NPC groups", () => {
  const goblin = { name: "Goblin", hp: 7, ac: 15, initiativeMod: 2, size: 1, color: "#dc2626" };
  const band: NpcGroup = { id: "g1", name: "Banda di goblin", members: [{ monster: goblin, quantity: 4 }, { monster: { ...goblin, name: "Capo goblin" }, quantity: 1 }] };

  it("lists saved groups and places one with a click", async () => {
    npcGroupSync.hydrate([{ rev: 1, data: band }]);
    const onPlaceGroup = vi.fn();
    renderPanel(sceneWithAria(), vi.fn(), { onPlaceGroup });
    const list = screen.getByRole("list", { name: "Gruppi di PNG" });
    expect(within(list).getByText("Banda di goblin")).toBeInTheDocument();
    expect(within(list).getByText("5 PNG")).toBeInTheDocument();
    await userEvent.click(within(list).getByRole("button", { name: "Piazza il gruppo Banda di goblin" }));
    expect(onPlaceGroup).toHaveBeenCalledWith(band);
  });

  it("shows nothing when there are no groups", () => {
    npcGroupSync.hydrate([]);
    renderPanel(sceneWithAria());
    expect(screen.queryByRole("list", { name: "Gruppi di PNG" })).not.toBeInTheDocument();
  });
});

describe("TokensPanel: eye icon", () => {
  const slash = 'svg path[d="M4 4L20 20"]';

  it("shows an open eye for a visible character and a slashed eye for a hidden one", () => {
    renderPanel(sceneWithAria());
    expect(screen.getByRole("button", { name: "Nascondi Aria ai giocatori" }).querySelector(slash)).toBeNull();
    expect(screen.getByRole("button", { name: "Nascondi Aria ai giocatori" }).querySelector("svg")).not.toBeNull();
  });

  it("draws the slash when the character is hidden", () => {
    const scene = { ...sceneWithAria(), tokens: [{ id: "t1", ref: { kind: "pc", id: "pc-a" } as Ref, x: 0, y: 0, hidden: true }] };
    renderPanel(scene);
    expect(screen.getByRole("button", { name: "Mostra Aria ai giocatori" }).querySelector(slash)).not.toBeNull();
  });
});
