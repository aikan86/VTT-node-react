import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerLink } from "./PlayerLink";
import { playerLink, playerLinkBase } from "./playerLinks";

const at = (hostname: string, port = "3001") => ({ protocol: "http:", hostname, port });
const lan = { listenHost: "0.0.0.0", addresses: ["192.168.1.20", "10.0.0.5"] };

describe("playerLinkBase", () => {
  it("keeps the address the master is using when it is already a network one", () => {
    expect(playerLinkBase(at("192.168.1.20"), lan)).toEqual({ base: "http://192.168.1.20:3001", note: null });
    expect(playerLinkBase({ protocol: "https:", hostname: "vtt.example", port: "" }, lan).base).toBe("https://vtt.example");
  });

  it("replaces localhost with the PC's network address", () => {
    expect(playerLinkBase(at("localhost"), lan)).toEqual({ base: "http://192.168.1.20:3001", note: null });
    expect(playerLinkBase(at("127.0.0.1", "5173"), lan).base).toBe("http://192.168.1.20:5173");
  });

  it("warns when the server only accepts connections from this PC", () => {
    const r = playerLinkBase(at("localhost"), { ...lan, listenHost: "127.0.0.1" });
    expect(r.base).toBe("http://192.168.1.20:3001");
    expect(r.note).toMatch(/HOST=0\.0\.0\.0/);
  });

  it("warns when there is no network address to use", () => {
    expect(playerLinkBase(at("localhost"), { listenHost: null, addresses: [] })).toMatchObject({ base: "http://localhost:3001", note: expect.stringMatching(/dal telefono non funziona/) });
    expect(playerLinkBase(at("localhost"), null).note).toMatch(/localhost/);
  });

  it("builds the link of a character", () => {
    expect(playerLink("http://192.168.1.20:3001", "pc a/1")).toBe("http://192.168.1.20:3001/giocatori/pc%20a%2F1");
  });
});

describe("PlayerLink", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the link and copies it", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<PlayerLink base="http://192.168.1.20:3001" pcId="aria" name="Aria" />);
    expect(screen.getByRole("textbox", { name: "Link del giocatore di Aria" })).toHaveValue("http://192.168.1.20:3001/giocatori/aria");
    expect(screen.getByRole("link", { name: "Apri la vista di Aria" })).toHaveAttribute("href", "http://192.168.1.20:3001/giocatori/aria");
    await user.click(screen.getByRole("button", { name: "Copia il link di Aria" }));
    expect(writeText).toHaveBeenCalledWith("http://192.168.1.20:3001/giocatori/aria");
    expect(await screen.findByText("Copiato ✓")).toBeInTheDocument();
  });

  it("says so when copying is not allowed", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<PlayerLink base="http://x" pcId="aria" name="Aria" />);
    await user.click(screen.getByRole("button", { name: "Copia il link di Aria" }));
    expect(await screen.findByText(/copialo a mano/)).toBeInTheDocument();
  });
});
