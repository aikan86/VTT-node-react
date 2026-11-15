import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Drawing } from "@vtt/shared";
import type { DrawTool, EffectTool } from "../types";
import { EffectsPanel } from "./EffectsPanel";

const effectTool: EffectTool = { placing: false, shape: "circle", sizeFt: 20, widthFt: 5, color: "#f97316" };
const drawTool: DrawTool = { mode: null, color: "#ffffff", strokeWidth: 3, fontSize: 24 };

function renderPanel(props: Partial<Parameters<typeof EffectsPanel>[0]> = {}) {
  const handlers = {
    onTool: vi.fn(),
    onDrawTool: vi.fn(),
    onChange: vi.fn(),
    onDrawingChange: vi.fn(),
    onDelete: vi.fn(),
    onClearAll: vi.fn(),
    onClearDrawings: vi.fn(),
  };
  render(
    <EffectsPanel
      tool={effectTool}
      drawTool={drawTool}
      selected={undefined}
      selectedDrawing={undefined}
      focusText={false}
      count={0}
      drawingCount={0}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("EffectsPanel drawing tools", () => {
  it("activates a drawing tool and turns off effect placement", async () => {
    const { onDrawTool, onTool } = renderPanel({ tool: { ...effectTool, placing: true } });
    await userEvent.click(screen.getByRole("button", { name: /mano libera/i }));
    expect(onDrawTool).toHaveBeenCalledWith({ ...drawTool, mode: "freehand" });
    expect(onTool).toHaveBeenCalledWith({ ...effectTool, placing: false });
  });

  it("toggles the active drawing tool off", async () => {
    const { onDrawTool } = renderPanel({ drawTool: { ...drawTool, mode: "eraser" } });
    const eraser = screen.getByRole("button", { name: /gomma/i });
    expect(eraser).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(eraser);
    expect(onDrawTool).toHaveBeenCalledWith({ ...drawTool, mode: null });
  });

  it("starting effect placement turns off the drawing tool", async () => {
    const { onDrawTool, onTool } = renderPanel({ drawTool: { ...drawTool, mode: "line" } });
    await userEvent.click(screen.getByRole("button", { name: /piazza effetto/i }));
    expect(onTool).toHaveBeenCalledWith({ ...effectTool, placing: true });
    expect(onDrawTool).toHaveBeenCalledWith({ ...drawTool, mode: null });
  });

  it("edits the text of the selected text drawing", async () => {
    const text: Drawing = { id: "t", kind: "text", x: 0, y: 0, text: "", fontSize: 24, rotation: 0, color: "#ffffff" };
    const { onDrawingChange } = renderPanel({ selectedDrawing: text, focusText: true });
    const field = screen.getByRole("textbox", { name: /testo/i });
    expect(field).toHaveFocus();
    await userEvent.type(field, "A");
    expect(onDrawingChange).toHaveBeenLastCalledWith({ ...text, text: "A" });
  });

  it("deletes the selected drawing and clears all drawings", async () => {
    const line: Drawing = { id: "l", kind: "line", points: [0, 0, 1, 1], strokeWidth: 3, color: "#ffffff" };
    const { onDelete, onClearDrawings } = renderPanel({ selectedDrawing: line, drawingCount: 2 });
    await userEvent.click(screen.getByRole("button", { name: /elimina disegno/i }));
    expect(onDelete).toHaveBeenCalledWith("l");
    await userEvent.click(screen.getByRole("button", { name: /cancella tutti i disegni \(2\)/i }));
    expect(onClearDrawings).toHaveBeenCalled();
  });
});
