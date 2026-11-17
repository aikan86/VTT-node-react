import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newScene } from "@vtt/shared";
import { useSceneStore } from "../../store/sceneStore";
import { SceneBar } from "./SceneBar";

vi.mock("../../api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/http")>()),
  api: { scenes: { update: vi.fn(async () => ({ status: "ok", rev: 2 })) } },
}));

const scene = { ...newScene("Cripta"), id: "s1" };

beforeEach(() => {
  useSceneStore.getState().hydrate([{ rev: 1, data: scene }]);
});

const current = () => useSceneStore.getState().scenes.find((s) => s.id === "s1")!;

describe("SceneBar: fog of war", () => {
  it("turns the fog on and off for the players", async () => {
    const { rerender } = render(<SceneBar scene={current()} />);
    const off = screen.getByRole("button", { name: "🌫 Nebbia di guerra: spenta" });
    expect(off).toHaveAttribute("aria-pressed", "false");
    expect(off).toHaveAttribute("title", expect.stringMatching(/vedono tutta la mappa/));

    await userEvent.click(off);
    expect(current().vision.enabled).toBe(true);
    rerender(<SceneBar scene={current()} />);
    const on = screen.getByRole("button", { name: "🌫 Nebbia di guerra" });
    expect(on).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(on);
    expect(current().vision.enabled).toBe(false);
  });
});
