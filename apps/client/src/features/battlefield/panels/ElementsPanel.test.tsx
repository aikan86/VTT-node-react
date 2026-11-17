import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_VISION, type MapElement } from "@vtt/shared";
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
  };
  render(
    <ElementsPanel
      tool="select"
      selected={undefined}
      selectedBlocker={undefined}
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
