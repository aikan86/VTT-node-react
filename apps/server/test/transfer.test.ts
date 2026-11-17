import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { emptyCombat, newCharacter, newDmRoll, newHandout, newScene, type Scene } from "@vtt/shared";
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

describe("/api/server-info", () => {
  it("tells the client where phones can reach this PC", async () => {
    const uploadsDir = mkdtempSync(join(tmpdir(), "vtt-uploads-"));
    const app = await buildApp({ dbPath: ":memory:", uploadsDir, logger: false, listenHost: "127.0.0.1", networkAddresses: () => ["192.168.1.20"] });
    instances.push({ app, uploadsDir });
    expect((await app.inject({ method: "GET", url: "/api/server-info" })).json()).toEqual({ listenHost: "127.0.0.1", addresses: ["192.168.1.20"] });
  });
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

  it("carries handouts (with their image), the bestiary and NPC groups", async () => {
    const { app, uploadsDir } = source;
    writeFileSync(join(uploadsDir, "letter.png"), png);
    const handout = newHandout("Lettera", "/uploads/letter.png");
    const monster = { id: "m1", name: "Goblin", hp: 7, ac: 15, initiativeMod: 2, size: 1, color: "#dc2626" };
    const { id: _id, ...stats } = monster;
    const group = { id: "g1", name: "Banda", members: [{ monster: stats, quantity: 4 }] };
    for (const [url, payload] of [["/api/handouts", handout], ["/api/monsters", monster], ["/api/npc-groups", group]] as const) {
      expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(201);
    }
    const file = (await app.inject({ method: "GET", url: "/api/export" })).json();
    expect(Object.keys(file.uploads)).toEqual(["letter.png"]);

    const target = await instance();
    expect((await target.app.inject({ method: "POST", url: "/api/import", payload: file })).json()).toMatchObject({ handouts: 1, monsters: 1, npcGroups: 1 });
    const data = async (url: string) => ((await target.app.inject({ method: "GET", url })).json() as { data: unknown }[]).map((d) => d.data);
    expect(await data("/api/handouts")).toEqual([handout]);
    expect(await data("/api/monsters")).toEqual([monster]);
    expect(await data("/api/npc-groups")).toEqual([group]);
    expect(existsSync(join(target.uploadsDir, "letter.png"))).toBe(true);
  });

  it("keeps handouts, bestiary and groups when importing a save made before they existed", async () => {
    const { app } = source;
    const file = (await app.inject({ method: "GET", url: "/api/export" })).json();
    delete file.handouts;
    delete file.monsters;
    delete file.npcGroups;
    const monster = { id: "m1", name: "Goblin", hp: 7, ac: 15, initiativeMod: 2, size: 1, color: "#dc2626" };
    await app.inject({ method: "POST", url: "/api/monsters", payload: monster });
    expect((await app.inject({ method: "POST", url: "/api/import", payload: file })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/monsters" })).json()).toHaveLength(1);
  });

  it("rejects invalid bestiary entries", async () => {
    const res = await source.app.inject({ method: "POST", url: "/api/monsters", payload: { id: "m", name: "X", hp: 0, ac: 10, initiativeMod: 0, size: 1, color: "#000000" } });
    expect(res.statusCode).toBe(400);
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
