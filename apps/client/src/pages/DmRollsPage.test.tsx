import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDmRollStore } from "../store/dmRollStore";
import { DmRollsPage } from "./DmRollsPage";

vi.mock("../api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/http")>()),
  api: {
    dmRolls: {
      create: vi.fn(async (r: unknown) => ({ rev: 1, data: r })),
      remove: vi.fn(async () => undefined),
    },
  },
}));

const bar = (face: number) => screen.getByRole("img", { name: new RegExp(`^${face}: `) });
const rows = () => screen.getAllByTestId("dm-roll-row");

beforeEach(() => {
  useDmRollStore.getState().hydrate([]);
});

describe("DmRollsPage", () => {
  it("records rolls in the table and updates the histogram", async () => {
    const user = userEvent.setup();
    render(<DmRollsPage />);
    expect(screen.getByText(/Nessun tiro registrato/)).toBeInTheDocument();

    const pad = screen.getByRole("group", { name: "Registra un tiro" });
    await user.click(within(pad).getByRole("button", { name: "20" }));
    await user.click(within(pad).getByRole("button", { name: "20" }));
    await user.click(within(pad).getByRole("button", { name: "7" }));

    // tabella: più recente in alto, numerazione cronologica
    expect(rows().map((r) => within(r).getByTestId("value").textContent)).toEqual(["7", "20", "20"]);
    expect(within(rows()[0]!).getByTestId("seq")).toHaveTextContent("3");

    expect(bar(20)).toHaveAccessibleName("20: 2 tiri (67%)");
    expect(bar(7)).toHaveAccessibleName("7: 1 tiro (33%)");
    expect(bar(1)).toHaveAccessibleName("1: 0 tiri (0%)");
    expect(screen.getByTestId("stat-count")).toHaveTextContent("3");
    expect(screen.getByTestId("stat-mean")).toHaveTextContent("15,7");
  });

  it("deletes a single roll and undoes the last one", async () => {
    const user = userEvent.setup();
    render(<DmRollsPage />);
    const pad = screen.getByRole("group", { name: "Registra un tiro" });
    for (const n of ["3", "18", "12"]) await user.click(within(pad).getByRole("button", { name: n }));

    await user.click(screen.getByRole("button", { name: "Annulla ultimo tiro (12)" }));
    expect(rows().map((r) => within(r).getByTestId("value").textContent)).toEqual(["18", "3"]);

    await user.click(screen.getByRole("button", { name: "Elimina tiro 1 (3)" }));
    expect(useDmRollStore.getState().rolls.map((r) => r.value)).toEqual([18]);
    expect(bar(3)).toHaveAccessibleName("3: 0 tiri (0%)");
  });
});
