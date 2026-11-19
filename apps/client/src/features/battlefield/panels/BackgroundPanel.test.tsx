import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { newScene, type MapObject, type Scene } from "@vtt/shared";
import type { ObjectTool } from "../types";
import { BackgroundPanel } from "./BackgroundPanel";

vi.mock("../../../api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/http")>()),
  api: {},
}));

const house: MapObject = { id: "o1", kind: "house", x: 2, y: 3, w: 6, h: 5, rotation: 0, color: "#9b3b2e", blocksSight: true };

function renderPanel(options: { scene?: Scene; selected?: MapObject; objectTool?: ObjectTool | null } = {}) {
  const handlers = {
    onObjectTool: vi.fn(),
    onChangeObject: vi.fn(),
    onDeleteObject: vi.fn(),
    onDuplicateObject: vi.fn(),
  };
  render(
    <BackgroundPanel
      scene={options.scene ?? newScene("Test")}
      onUpdate={vi.fn()}
      calibrationStep={null}
      onStartCalibration={vi.fn()}
      onCancelCalibration={vi.fn()}
      selectedObject={options.selected}
      objectTool={options.objectTool ?? null}
      {...handlers}
    />,
  );
  return handlers;
}

describe("BackgroundPanel: objects", () => {
  it("offers every built-in object and arms the one clicked for placement", async () => {
    const { onObjectTool } = renderPanel();
    for (const name of ["Fontana", "Casa", "Tenda", "Muro", "Albero"]) {
      expect(screen.getByRole("button", { name: new RegExp(name) })).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole("button", { name: /Fontana/ }));
    expect(onObjectTool).toHaveBeenCalledWith({ kind: "fountain" });
  });

  it("explains how to place the armed object and lets the master disarm it", async () => {
    const { onObjectTool } = renderPanel({ objectTool: { kind: "tent" } });
    expect(screen.getByRole("status")).toHaveTextContent("Clicca sulla mappa per piazzare: tenda");
    await userEvent.click(screen.getByRole("button", { name: /Tenda/ }));
    expect(onObjectTool).toHaveBeenCalledWith(null);
  });

  it("edits the selected object: blocks the view, duplicates and deletes", async () => {
    const { onChangeObject, onDuplicateObject, onDeleteObject } = renderPanel({ selected: house });
    const section = screen.getByRole("region", { name: "Oggetto selezionato" });
    expect(section).toHaveTextContent("6 × 5 celle");
    const checkbox = screen.getByRole("checkbox", { name: "Blocca la vista dei personaggi" });
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(onChangeObject).toHaveBeenCalledWith({ ...house, blocksSight: false });
    await userEvent.click(screen.getByRole("button", { name: "Duplica" }));
    expect(onDuplicateObject).toHaveBeenCalledWith(house);
    await userEvent.click(screen.getByRole("button", { name: "Elimina" }));
    expect(onDeleteObject).toHaveBeenCalledWith("o1");
  });

  it("has no colour picker for uploaded images", () => {
    renderPanel({ selected: { ...house, kind: "image", imageUrl: "/uploads/a.png", color: "#ffffff" } });
    const section = screen.getByRole("region", { name: "Oggetto selezionato" });
    expect(within(section).queryByLabelText("Colore")).not.toBeInTheDocument();
    expect(within(section).getByLabelText("Etichetta")).toBeInTheDocument();
  });

  it("disables everything when the background layer is locked", () => {
    const scene = newScene("Test");
    scene.layers.background.locked = true;
    renderPanel({ scene, selected: house });
    expect(screen.getByRole("button", { name: /Fontana/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Duplica" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Elimina" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Blocca la vista dei personaggi" })).toBeDisabled();
  });
});
