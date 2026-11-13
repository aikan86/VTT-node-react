import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCombat, newCharacter } from "@vtt/shared";
import { useCombatStore } from "../store/combatStore";
import { usePartyStore } from "../store/partyStore";
import { useSceneStore } from "../store/sceneStore";
import { InitiativePage } from "./InitiativePage";

vi.mock("../api/http", async (importOriginal) => {
  let rev = 1;
  const saved = vi.fn(async () => ({ status: "ok" as const, rev: ++rev }));
  return {
    ...(await importOriginal<typeof import("../api/http")>()),
    api: { characters: { update: saved }, scenes: { update: saved }, combat: { put: saved } },
  };
});

const rowNames = () => screen.getAllByTestId("combatant-row").map((row) => within(row).getAllByText(/\S/)[0]!.textContent);

beforeEach(() => {
  usePartyStore.getState().hydrate([
    { rev: 1, data: newCharacter({ id: "pc-a", name: "Aria", initiativeMod: 3 }) },
    { rev: 1, data: newCharacter({ id: "pc-b", name: "Borin", initiativeMod: 0 }) },
  ]);
  useCombatStore.getState().hydrate({ rev: 0, data: emptyCombat() });
  useSceneStore.getState().hydrate([]);
  vi.stubGlobal("confirm", () => true);
});

describe("InitiativePage", () => {
  it("runs a full round: add party + npc, roll, start, tick turns, advance round", async () => {
    const user = userEvent.setup();
    render(<InitiativePage />);

    await user.click(screen.getByRole("button", { name: "+ Aggiungi party" }));
    expect(rowNames()).toEqual(["Aria", "Borin"]);
    expect(screen.getByRole("button", { name: "+ Aggiungi party" })).toBeDisabled();

    // PNG al volo
    await user.click(screen.getByRole("button", { name: "+ Aggiungi PNG" }));
    const dialog = screen.getByRole("dialog", { name: "Aggiungi PNG" });
    const name = within(dialog).getByLabelText("Nome");
    await user.clear(name);
    await user.type(name, "Orco");
    await user.click(within(dialog).getByRole("button", { name: "Aggiungi" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Tiri manuali: Aria 10+3=13, Borin 18+0=18, Orco (mod +2) 5+2=7
    await user.type(screen.getByLabelText("d20 di Aria"), "10");
    await user.type(screen.getByLabelText("d20 di Borin"), "18");
    await user.type(screen.getByLabelText("d20 di Orco"), "5");
    expect(rowNames()).toEqual(["Borin", "Aria", "Orco"]);
    expect(screen.getAllByTestId("total").map((t) => t.textContent)).toEqual(["18", "13", "7"]);
    expect(screen.getByRole("button", { name: "🎲 Tira tutti" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "⚔ Inizia combattimento" }));
    expect(screen.getByTestId("round")).toHaveTextContent("1");
    expect(screen.getAllByTestId("combatant-row")[0]).toHaveAttribute("aria-current", "step");

    const next = () => user.click(screen.getByRole("button", { name: "Turno successivo ▶" }));
    await next();
    expect(screen.getByLabelText("Borin ha agito")).toBeChecked();
    expect(screen.getAllByTestId("combatant-row")[1]).toHaveAttribute("aria-current", "step");

    await next();
    await next();
    expect(screen.getByTestId("round")).toHaveTextContent("2");
    for (const n of ["Aria", "Borin", "Orco"]) expect(screen.getByLabelText(`${n} ha agito`)).not.toBeChecked();
    expect(screen.getAllByTestId("combatant-row")[0]).toHaveAttribute("aria-current", "step");
  });

  it("rolls only missing d20s with 'Tira tutti'", async () => {
    const user = userEvent.setup();
    render(<InitiativePage />);
    await user.click(screen.getByRole("button", { name: "+ Aggiungi party" }));
    await user.type(screen.getByLabelText("d20 di Aria"), "20");

    await user.click(screen.getByRole("button", { name: "🎲 Tira tutti" }));
    const combatants = useCombatStore.getState().combat.combatants;
    expect(combatants.find((c) => c.ref.id === "pc-a")!.roll).toBe(20);
    const borin = combatants.find((c) => c.ref.id === "pc-b")!.roll;
    expect(borin).toBeGreaterThanOrEqual(1);
    expect(borin).toBeLessThanOrEqual(20);
  });

  it("applies damage to a PC from the tracker and updates the party", async () => {
    const user = userEvent.setup();
    render(<InitiativePage />);
    await user.click(screen.getByRole("button", { name: "+ Aggiungi party" }));
    await user.type(screen.getByLabelText("Quantità PF per Aria"), "4");
    await user.click(screen.getByRole("button", { name: "Danno a Aria" }));
    expect(usePartyStore.getState().characters[0]!.hp.current).toBe(6);
  });

  it("renames an npc by clicking its name or the edit button", async () => {
    const user = userEvent.setup();
    render(<InitiativePage />);
    await user.click(screen.getByRole("button", { name: "+ Aggiungi party" }));
    await user.click(screen.getByRole("button", { name: "+ Aggiungi PNG" }));
    const dialog = screen.getByRole("dialog", { name: "Aggiungi PNG" });
    await user.clear(within(dialog).getByLabelText("Nome"));
    await user.type(within(dialog).getByLabelText("Nome"), "Orco");
    await user.click(within(dialog).getByRole("button", { name: "Aggiungi" }));

    // PG non rinominabili dal tracker
    expect(screen.queryByRole("button", { name: "Rinomina Aria" })).not.toBeInTheDocument();

    // Click sul nome -> input, Invio conferma
    await user.click(screen.getByRole("button", { name: "Orco" }));
    const input = screen.getByLabelText("Nome di Orco");
    await user.clear(input);
    await user.type(input, "Capo orco{Enter}");
    expect(useCombatStore.getState().combat.npcs[0]!.name).toBe("Capo orco");

    // Tasto modifica -> Esc annulla
    await user.click(screen.getByRole("button", { name: "Rinomina Capo orco" }));
    await user.clear(screen.getByLabelText("Nome di Capo orco"));
    await user.type(screen.getByLabelText("Nome di Capo orco"), "Altro{Escape}");
    expect(useCombatStore.getState().combat.npcs[0]!.name).toBe("Capo orco");

    // Nome vuoto non viene salvato
    await user.click(screen.getByRole("button", { name: "Rinomina Capo orco" }));
    await user.clear(screen.getByLabelText("Nome di Capo orco"));
    await user.keyboard("{Enter}");
    expect(useCombatStore.getState().combat.npcs[0]!.name).toBe("Capo orco");
    expect(screen.getByRole("button", { name: "Capo orco" })).toBeInTheDocument();
  });

  it("edits combat notes for a combatant", async () => {
    const user = userEvent.setup();
    render(<InitiativePage />);
    await user.click(screen.getByRole("button", { name: "+ Aggiungi party" }));
    await user.type(screen.getByLabelText("Note di combattimento di Borin"), "Prono");
    const borin = useCombatStore.getState().combat.combatants.find((c) => c.ref.id === "pc-b")!;
    expect(borin.notes).toBe("Prono");
    expect(screen.getByLabelText("Note di combattimento di Borin")).toHaveValue("Prono");
  });

  it("changes the color of a PC and of an NPC from the swatch", async () => {
    const user = userEvent.setup();
    render(<InitiativePage />);
    await user.click(screen.getByRole("button", { name: "+ Aggiungi party" }));
    await user.click(screen.getByRole("button", { name: "+ Aggiungi PNG" }));
    const dialog = screen.getByRole("dialog", { name: "Aggiungi PNG" });
    await user.clear(within(dialog).getByLabelText("Nome"));
    await user.type(within(dialog).getByLabelText("Nome"), "Orco");
    await user.click(within(dialog).getByRole("button", { name: "Aggiungi" }));

    fireEvent.change(screen.getByLabelText("Colore di Aria"), { target: { value: "#123456" } });
    expect(usePartyStore.getState().characters.find((c) => c.id === "pc-a")!.color).toBe("#123456");

    fireEvent.change(screen.getByLabelText("Colore di Orco"), { target: { value: "#abcdef" } });
    expect(useCombatStore.getState().combat.npcs[0]!.color).toBe("#abcdef");
    expect(screen.getByLabelText("Colore di Orco")).toHaveValue("#abcdef");
  });

  it("ends combat after confirmation and clears rolls", async () => {
    const user = userEvent.setup();
    render(<InitiativePage />);
    await user.click(screen.getByRole("button", { name: "+ Aggiungi party" }));
    await user.click(screen.getByRole("button", { name: "🎲 Tira tutti" }));
    await user.click(screen.getByRole("button", { name: "⚔ Inizia combattimento" }));
    await user.click(screen.getByRole("button", { name: "Termina" }));
    await act(async () => {});
    expect(screen.getByTestId("round")).toHaveTextContent("—");
    expect(useCombatStore.getState().combat.combatants.every((c) => c.roll === null)).toBe(true);
  });
});
