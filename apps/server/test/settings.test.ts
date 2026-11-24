import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";

const hidden = { showInitiative: false, showNpcHp: false, showPartyHp: false };

const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const opened: { app: FastifyInstance; uploadsDir: string }[] = [];

async function instance() {
  const uploadsDir = mkdtempSync(join(tmpdir(), "vtt-uploads-"));
  const app = await buildApp({ dbPath: ":memory:", uploadsDir, logger: false });
  opened.push({ app, uploadsDir });
  return { app, uploadsDir };
}

afterEach(async () => {
  for (const { app, uploadsDir } of opened.splice(0)) {
    await app.close();
    rmSync(uploadsDir, { recursive: true, force: true });
  }
});

describe("/api/settings", () => {
  it("starts with the default logo and saves a custom one", async () => {
    const { app } = await instance();
    expect((await app.inject({ method: "GET", url: "/api/settings" })).json()).toEqual({ rev: 0, data: { logoUrl: null, playerView: hidden } });

    const put = await app.inject({ method: "PUT", url: "/api/settings", payload: { logoUrl: "/uploads/logo.png" }, headers: { "if-match": "0" } });
    expect(put.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/settings" })).json()).toEqual({ rev: 1, data: { logoUrl: "/uploads/logo.png", playerView: hidden } });

    // versione superata: conflitto con lo stato attuale
    const stale = await app.inject({ method: "PUT", url: "/api/settings", payload: { logoUrl: null }, headers: { "if-match": "0" } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().current).toEqual({ rev: 1, data: { logoUrl: "/uploads/logo.png", playerView: hidden } });
  });

  it("only accepts images uploaded to the VTT", async () => {
    const { app } = await instance();
    const res = await app.inject({ method: "PUT", url: "/api/settings", payload: { logoUrl: "https://example.com/logo.png" }, headers: { "if-match": "0" } });
    expect(res.statusCode).toBe(400);
  });

  it("travels with export and import, together with the logo image", async () => {
    const source = await instance();
    writeFileSync(join(source.uploadsDir, "logo.png"), png);
    await source.app.inject({ method: "PUT", url: "/api/settings", payload: { logoUrl: "/uploads/logo.png" }, headers: { "if-match": "0" } });
    const file = (await source.app.inject({ method: "GET", url: "/api/export" })).json();
    expect(file.settings).toEqual({ logoUrl: "/uploads/logo.png", playerView: hidden });
    expect(Object.keys(file.uploads)).toEqual(["logo.png"]);

    const target = await instance();
    expect((await target.app.inject({ method: "POST", url: "/api/import", payload: file })).statusCode).toBe(200);
    expect((await target.app.inject({ method: "GET", url: "/api/settings" })).json().data).toEqual({ logoUrl: "/uploads/logo.png", playerView: hidden });
    expect(existsSync(join(target.uploadsDir, "logo.png"))).toBe(true);
  });

  it("keeps the current logo when importing a save made before settings existed", async () => {
    const { app } = await instance();
    await app.inject({ method: "PUT", url: "/api/settings", payload: { logoUrl: "/uploads/mio.png" }, headers: { "if-match": "0" } });
    const file = (await app.inject({ method: "GET", url: "/api/export" })).json();
    delete file.settings;
    await app.inject({ method: "PUT", url: "/api/settings", payload: { logoUrl: "/uploads/nuovo.png" }, headers: { "if-match": "1" } });
    expect((await app.inject({ method: "POST", url: "/api/import", payload: file })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/settings" })).json().data).toEqual({ logoUrl: "/uploads/nuovo.png", playerView: hidden });
  });

  it("hides initiative and HP from the players by default and saves the choice", async () => {
    const { app } = await instance();
    expect((await app.inject({ method: "GET", url: "/api/settings" })).json().data.playerView).toEqual(hidden);

    const playerView = { showInitiative: true, showNpcHp: false, showPartyHp: true };
    const put = await app.inject({ method: "PUT", url: "/api/settings", payload: { logoUrl: null, playerView }, headers: { "if-match": "0" } });
    expect(put.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/settings" })).json()).toEqual({ rev: 1, data: { logoUrl: null, playerView } });

    // viaggia con l'esportazione
    const file = (await app.inject({ method: "GET", url: "/api/export" })).json();
    expect(file.settings.playerView).toEqual(playerView);
    const target = await instance();
    expect((await target.app.inject({ method: "POST", url: "/api/import", payload: file })).statusCode).toBe(200);
    expect((await target.app.inject({ method: "GET", url: "/api/settings" })).json().data.playerView).toEqual(playerView);
  });

  it("keeps the saved player view when a PUT does not mention it (tab with an older version of the app)", async () => {
    const { app } = await instance();
    const playerView = { showInitiative: true, showNpcHp: true, showPartyHp: false };
    await app.inject({ method: "PUT", url: "/api/settings", payload: { logoUrl: null, playerView }, headers: { "if-match": "0" } });

    const put = await app.inject({ method: "PUT", url: "/api/settings", payload: { logoUrl: "/uploads/logo.png" }, headers: { "if-match": "1" } });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ rev: 2, data: { logoUrl: "/uploads/logo.png", playerView } });
    expect((await app.inject({ method: "GET", url: "/api/settings" })).json().data).toEqual({ logoUrl: "/uploads/logo.png", playerView });
  });
});
