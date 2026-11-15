import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { emptyCombat, newCharacter, newDmRoll, newScene, type Scene } from "@vtt/shared";
import { buildApp } from "../src/app";

const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

interface Instance {
  app: FastifyInstance;
  uploadsDir: string;
}

const instances: Instance[] = [];

async function instance(): Promise<Instance> {
  const uploadsDir = mkdtempSync(join(tmpdir(), "vtt-uploads-"));
  const app = await buildApp({ dbPath: ":memory:", uploadsDir, logger: false });
  const created = { app, uploadsDir };
  instances.push(created);
  return created;
}

afterEach(async () => {
  for (const { app, uploadsDir } of instances.splice(0)) {
    await app.close();
    rmSync(uploadsDir, { recursive: true, force: true });
  }
});

const sceneWithImage = (imageUrl: string): Scene => ({
  ...newScene("Cripta"),
  background: { imageUrl, widthPx: 100, heightPx: 80, x: 0, y: 0, rotation: 0 },
});

let source: Instance;

beforeEach(async () => {
  source = await instance();
});

describe("/api/export + /api/import", () => {
  it("round-trips the whole state, including the images in use, into an empty instance", async () => {
    const { app, uploadsDir } = source;
    writeFileSync(join(uploadsDir, "used.png"), png);
    writeFileSync(join(uploadsDir, "orphan.png"), png);
    const pc = newCharacter({ name: "Aragorn" });
    const scene = sceneWithImage("/uploads/used.png");
    const roll = newDmRoll(17);
    const combat = { ...emptyCombat(), round: 3 };
    await app.inject({ method: "POST", url: "/api/characters", payload: pc });
    await app.inject({ method: "POST", url: "/api/scenes", payload: scene });
    await app.inject({ method: "POST", url: "/api/dm-rolls", payload: roll });
    await app.inject({ method: "PUT", url: "/api/combat", payload: combat, headers: { "if-match": "0" } });

    const exported = await app.inject({ method: "GET", url: "/api/export" });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-disposition"]).toMatch(/^attachment; filename="vtt-.+\.json"$/);
    const file = exported.json();
    expect(Object.keys(file.uploads)).toEqual(["used.png"]);

    const target = await instance();
    const imported = await target.app.inject({ method: "POST", url: "/api/import", payload: file });
    expect(imported.statusCode).toBe(200);

    const data = async (url: string) =>
      ((await target.app.inject({ method: "GET", url })).json() as { data: unknown }[]).map((d) => d.data);
    expect(await data("/api/characters")).toEqual([pc]);
    expect(await data("/api/scenes")).toEqual([scene]);
    expect(await data("/api/dm-rolls")).toEqual([roll]);
    expect((await target.app.inject({ method: "GET", url: "/api/combat" })).json().data).toEqual(combat);
    expect(readFileSync(join(target.uploadsDir, "used.png")).equals(png)).toBe(true);
    expect(existsSync(join(target.uploadsDir, "orphan.png"))).toBe(false);
  });

  it("replaces the current state: documents missing from the file are deleted", async () => {
    const { app } = source;
    const exported = (await app.inject({ method: "GET", url: "/api/export" })).json();
    const extra = newCharacter({ name: "Intruso" });
    await app.inject({ method: "POST", url: "/api/characters", payload: extra });
    await app.inject({ method: "PUT", url: "/api/combat", payload: { ...emptyCombat(), round: 5 }, headers: { "if-match": "0" } });

    const res = await app.inject({ method: "POST", url: "/api/import", payload: exported });
    expect(res.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/characters" })).json()).toEqual([]);
    expect((await app.inject({ method: "GET", url: "/api/combat" })).json().data).toEqual(emptyCombat());
    // lo stato sostituito resta recuperabile dalla cronologia
    const history = (await app.inject({ method: "GET", url: `/api/history/characters/${extra.id}` })).json();
    expect(history[0].data.name).toBe("Intruso");
  });

  it("rejects an invalid file without touching the current state", async () => {
    const { app } = source;
    const pc = newCharacter({ name: "Aragorn" });
    await app.inject({ method: "POST", url: "/api/characters", payload: pc });
    const exported = (await app.inject({ method: "GET", url: "/api/export" })).json();

    const broken = { ...exported, characters: [], scenes: [{ id: "x" }] };
    const res = await app.inject({ method: "POST", url: "/api/import", payload: broken });
    expect(res.statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/characters" })).json()).toHaveLength(1);

    const notAnExport = await app.inject({ method: "POST", url: "/api/import", payload: { hello: "world" } });
    expect(notAnExport.statusCode).toBe(400);
  });

  it("rejects image names that could escape the uploads folder", async () => {
    const { app, uploadsDir } = source;
    const exported = (await app.inject({ method: "GET", url: "/api/export" })).json();
    const evil = { ...exported, uploads: { "../evil.png": { type: "image/png", data: png.toString("base64") } } };
    const res = await app.inject({ method: "POST", url: "/api/import", payload: evil });
    expect(res.statusCode).toBe(400);
    expect(existsSync(join(uploadsDir, "..", "evil.png"))).toBe(false);
  });
});
