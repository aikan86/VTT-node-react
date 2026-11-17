import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_VISION, type Light, type MapElement } from "@vtt/shared";
import { ElementsPanel } from "./ElementsPanel";

const door: MapElement = { id: "d1", type: "door", x: 0, y: 0, w: 1, h: 2, rotation: 0, color: "#92400e" };

function renderPanel(props: Partial<Parameters<typeof ElementsPanel>[0]> = {}) {
  const handlers = {
    onTool: vi.fn(),
    onChange: vi.fn(),
    onDelete: vi.fn(),
    onCloseTrace: vi.fn(),
    onCancelTrace: vi.fn(),
    onVision: vi.fn(),
    onToggleDoor: vi.fn(),
    onResetExplored: vi.fn(),
    onLightChange: vi.fn(),
    onDark: vi.fn(),
  };
  render(
    <ElementsPanel
      tool="select"
      selected={undefined}
      selectedBlocker={undefined}
      selectedLight={undefined}
      dark={false}
      tracePoints={0}
      vision={{ ...DEFAULT_VISION, enabled: true }}
      exploredCount={0}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("ElementsPanel doors", () => {
  it("opens a selected closed door", async () => {
    const { onToggleDoor } = renderPanel({ selected: door });
    expect(screen.getByText(/chiusa: blocca la vista/i)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /apri porta/i });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(onToggleDoor).toHaveBeenCalledWith("d1");
  });

  it("offers to close an open door", async () => {
    const { onToggleDoor } = renderPanel({ selected: { ...door, open: true } });
    expect(screen.getByText(/aperta: non blocca la vista/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /chiudi porta/i }));
    expect(onToggleDoor).toHaveBeenCalledWith("d1");
  });

  it("has no door button for other elements", () => {
    renderPanel({ selected: { ...door, type: "wall", color: "#4b5563" } });
    expect(screen.queryByRole("button", { name: /apri porta|chiudi porta/i })).not.toBeInTheDocument();
  });

  it("drops the open flag when a door becomes something else", async () => {
    const { onChange } = renderPanel({ selected: { ...door, open: true } });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /tipo/i }), "wall");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: "wall", open: undefined }));
  });
});

const torch: Light = { id: "l1", x: 2.5, y: 3.5, brightFt: 20, dimFt: 20, color: "#fbbf24" };

describe("ElementsPanel lights", () => {
  it("selects the light tool and explains how to place it", async () => {
    const { onTool } = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: /^luce$/i }));
    expect(onTool).toHaveBeenCalledWith("light");
  });

  it("shows the placement hint while the light tool is active", () => {
    renderPanel({ tool: "light" });
    expect(screen.getByRole("button", { name: /^luce$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/clicca sulla mappa per piazzare una luce/i)).toBeInTheDocument();
  });

  it("edits bright and dim radius of the selected light", async () => {
    const { onLightChange } = renderPanel({ selectedLight: torch });
    const panel = screen.getByRole("region", { name: /luce selezionata/i });
    expect(panel).toHaveTextContent("Illumina fino a 40 ft");
    const bright = screen.getByRole("textbox", { name: /luce piena/i });
    await userEvent.clear(bright);
    await userEvent.type(bright, "30");
    expect(onLightChange).toHaveBeenLastCalledWith({ ...torch, brightFt: 30 });
    const dim = screen.getByRole("textbox", { name: /penombra/i });
    await userEvent.clear(dim);
    await userEvent.type(dim, "5");
    expect(onLightChange).toHaveBeenLastCalledWith({ ...torch, dimFt: 5 });
  });

  it("deletes the selected light", async () => {
    const { onDelete } = renderPanel({ selectedLight: torch });
    await userEvent.click(screen.getByRole("button", { name: /elimina luce/i }));
    expect(onDelete).toHaveBeenCalledWith("l1");
  });
});

describe("ElementsPanel dark scene", () => {
  it("turns darkness on", async () => {
    const { onDark } = renderPanel();
    const box = screen.getByRole("checkbox", { name: /scena buia/i });
    expect(box).not.toBeChecked();
    expect(screen.queryByText(/vede solo dentro le luci/i)).not.toBeInTheDocument();
    await userEvent.click(box);
    expect(onDark).toHaveBeenCalledWith(true);
  });

  it("explains what the party sees when dark", () => {
    renderPanel({ dark: true });
    expect(screen.getByRole("checkbox", { name: /scena buia/i })).toBeChecked();
    expect(screen.getByText(/vede solo dentro le luci/i)).toBeInTheDocument();
  });

  it("is not shown as dark while vision is off", () => {
    renderPanel({ dark: true, vision: { ...DEFAULT_VISION, enabled: false } });
    expect(screen.getByRole("checkbox", { name: /scena buia/i })).not.toBeChecked();
  });
});

describe("ElementsPanel fog of war", () => {
  it("can be switched off, and then says players see the whole map", async () => {
    const { onVision } = renderPanel({ vision: { ...DEFAULT_VISION, enabled: false } });
    const box = screen.getByRole("checkbox", { name: /nebbia di guerra/i });
    expect(box).not.toBeChecked();
    expect(screen.getByText(/vedono tutta la mappa/i)).toBeInTheDocument();
    await userEvent.click(box);
    expect(onVision).toHaveBeenCalledWith({ enabled: true });
  });

  it("does not show the note while it is on", () => {
    renderPanel();
    expect(screen.getByRole("checkbox", { name: /nebbia di guerra/i })).toBeChecked();
    expect(screen.queryByText(/vedono tutta la mappa/i)).not.toBeInTheDocument();
  });
});

describe("ElementsPanel fog memory", () => {
  it("shows how many cells were explored and resets them", async () => {
    const { onResetExplored } = renderPanel({ exploredCount: 42 });
    expect(screen.getByText(/42 celle esplorate/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /azzera zone esplorate/i }));
    expect(onResetExplored).toHaveBeenCalledOnce();
  });

  it("disables the reset when nothing was explored", () => {
    renderPanel({ exploredCount: 0 });
    expect(screen.getByRole("button", { name: /azzera zone esplorate/i })).toBeDisabled();
  });
});
