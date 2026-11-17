import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLibraryStore, monsterSync, npcGroupSync } from "../../store/libraryStore";
import { AddNpcDialog } from "./AddNpcDialog";

vi.mock("../../api/http", async (importOriginal) => {
  const created = vi.fn(async (doc: unknown) => ({ rev: 1, data: doc }));
  const removed = vi.fn(async () => undefined);
  const col = { list: vi.fn(async () => []), create: created, update: vi.fn(async () => ({ status: "ok", rev: 2 })), remove: removed };
  return { ...(await importOriginal<typeof import("../../api/http")>()), api: { monsters: col, npcGroups: col, handouts: col } };
});

beforeEach(() => {
  monsterSync.hydrate([]);
  npcGroupSync.hydrate([]);
  vi.stubGlobal("confirm", () => true);
});

function open() {
  const onSubmit = vi.fn();
  render(<AddNpcDialog onClose={vi.fn()} onSubmit={onSubmit} />);
  return onSubmit;
}

const monsterSelect = () => screen.getByRole("combobox", { name: "Mostro" });
const file = (content: string) => new File([content], "bestiario.json", { type: "application/json" });

describe("AddNpcDialog: bestiary", () => {
  it("starts from the Goblin and fills the fields from a preset monster", async () => {
    const onSubmit = open();
    expect(screen.getByLabelText("Nome")).toHaveValue("Goblin");
    await userEvent.selectOptions(monsterSelect(), screen.getByRole("option", { name: "Orco (GS 1/2)" }));
    expect(screen.getByLabelText("Nome")).toHaveValue("Orco");
    expect(screen.getByRole("textbox", { name: "PF" })).toHaveValue("15");
    expect(screen.getByRole("textbox", { name: "CA" })).toHaveValue("13");
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi PNG" }));
    expect(onSubmit).toHaveBeenCalledWith({
      entries: [{ template: expect.objectContaining({ name: "Orco", hp: { current: 15, max: 15, temp: 0 }, ac: 13, initiativeMod: 1 }), quantity: 1 }],
      placeOnMap: false,
    });
  });

  it("imports monsters from a JSON file into the personal bestiary", async () => {
    open();
    const json = JSON.stringify([
      { name: "Kenku", hp: 13, ac: 13, initiativeMod: 3, cr: "1/4" },
      { name: "Senza statistiche" },
      { name: "Owlbear", hit_points: 59, armor_class: [{ value: 13 }], dexterity: 12, size: "Large" },
    ]);
    await userEvent.upload(screen.getByLabelText("File JSON del bestiario"), file(json));
    expect(await screen.findByRole("status")).toHaveTextContent("Importati 2 mostri nel tuo bestiario (1 scartati");
    expect(useLibraryStore.getState().monsters.map((m) => m.name)).toEqual(["Kenku", "Owlbear"]);
    const mine = within(monsterSelect()).getByRole("group", { name: "Il tuo bestiario" });
    await userEvent.selectOptions(monsterSelect(), within(mine).getByRole("option", { name: "Owlbear" }));
    expect(screen.getByRole("textbox", { name: "PF" })).toHaveValue("59");
    expect(screen.getByRole("combobox", { name: "Taglia" })).toHaveValue("2");
  });

  it("explains why a file cannot be imported", async () => {
    open();
    await userEvent.upload(screen.getByLabelText("File JSON del bestiario"), file("non è json"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Il file non è un JSON valido");
    expect(useLibraryStore.getState().monsters).toEqual([]);
  });

  it("saves the current fields as a monster, and removes it again", async () => {
    open();
    await userEvent.clear(screen.getByLabelText("Nome"));
    await userEvent.type(screen.getByLabelText("Nome"), "Sgherro del barone");
    await userEvent.click(screen.getByRole("button", { name: "Salva nel bestiario" }));
    expect(useLibraryStore.getState().monsters.map((m) => m.name)).toEqual(["Sgherro del barone"]);
    await userEvent.click(screen.getByRole("button", { name: "Rimuovi dal bestiario" }));
    expect(useLibraryStore.getState().monsters).toEqual([]);
  });
});

describe("AddNpcDialog: NPC groups", () => {
  it("builds a mixed group, saves it and adds it with one click", async () => {
    const onSubmit = open();
    const qty = screen.getByRole("textbox", { name: "Quantità" });
    await userEvent.clear(qty);
    await userEvent.type(qty, "4");
    await userEvent.click(screen.getByRole("button", { name: "+ Aggiungi al gruppo: 4 Goblin" }));
    await userEvent.selectOptions(monsterSelect(), screen.getByRole("option", { name: "Hobgoblin (GS 1/2)" }));
    await userEvent.clear(qty);
    await userEvent.type(qty, "1");
    await userEvent.click(screen.getByRole("button", { name: "+ Aggiungi al gruppo: 1 Hobgoblin" }));

    const draft = screen.getByLabelText("Nuovo gruppo");
    expect(within(draft).getAllByRole("listitem").map((li) => li.textContent?.replace("✕", "").trim())).toEqual(["4 Goblin", "1 Hobgoblin"]);
    const save = within(draft).getByRole("button", { name: "Salva gruppo" });
    expect(save).toBeDisabled();
    await userEvent.type(within(draft).getByLabelText("Nome del gruppo"), "Banda di goblin");
    await userEvent.click(save);
    expect(screen.queryByLabelText("Nuovo gruppo")).not.toBeInTheDocument();

    const [group] = useLibraryStore.getState().npcGroups;
    expect(group).toMatchObject({ name: "Banda di goblin", members: [{ quantity: 4, monster: { name: "Goblin" } }, { quantity: 1, monster: { name: "Hobgoblin" } }] });
    const saved = screen.getByRole("list", { name: "Gruppi salvati" });
    expect(within(saved).getByText("· 4 Goblin, 1 Hobgoblin")).toBeInTheDocument();

    await userEvent.click(within(saved).getByRole("button", { name: "Aggiungi il gruppo Banda di goblin" }));
    expect(onSubmit).toHaveBeenCalledWith({
      entries: [
        { template: expect.objectContaining({ name: "Goblin", ac: 15 }), quantity: 4 },
        { template: expect.objectContaining({ name: "Hobgoblin", ac: 18 }), quantity: 1 },
      ],
      placeOnMap: false,
    });
  });

  it("removes a member from the draft and deletes a saved group", async () => {
    open();
    await userEvent.click(screen.getByRole("button", { name: "+ Aggiungi al gruppo: 1 Goblin" }));
    await userEvent.click(screen.getByRole("button", { name: "Togli Goblin dal gruppo" }));
    expect(screen.queryByLabelText("Nuovo gruppo")).not.toBeInTheDocument(); // bozza vuota: sparisce

    npcGroupSync.hydrate([{ rev: 1, data: { id: "g1", name: "Pattuglia", members: [{ monster: { name: "Guardia", hp: 11, ac: 16, initiativeMod: 1, size: 1, color: "#1d4ed8" }, quantity: 3 }] } }]);
    await userEvent.click(await screen.findByRole("button", { name: "Elimina il gruppo Pattuglia" }));
    expect(useLibraryStore.getState().npcGroups).toEqual([]);
  });
});
