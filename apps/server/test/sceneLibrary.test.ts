import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { newScene, type Npc, type Scene } from "@vtt/shared";
import { buildApp } from "../src/app";
import { SCHEMA_VERSION } from "../src/db";

let app: FastifyInstance;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "vtt-library-"));
  app = await buildApp({ dbPath: ":memory:", uploadsDir: join(dir, "uploads"), logger: false });
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const goblin: Npc = { id: "g1", name: "Goblin", color: "#16a34a", hp: { current: 5, max: 5, temp: 0 }, ac: 15, initiativeMod: 1, size: 1, conditions: [] };

function tavern(): Scene {
  return {
    ...newScene("Scena 1"),
    background: { imageUrl: "/uploads/taverna.jpg", widthPx: 1000, heightPx: 600, x: 0, y: 0, rotation: 0 },
    explored: ["0,0"],
    shownToPlayers: true,
    pcStart: { x: 3, y: 3 },
    tokens: [
      { id: "t1", ref: { kind: "pc", id: "aria" }, x: 1, y: 1 },
      { id: "t2", ref: { kind: "npc", id: "g1" }, x: 3, y: 3 },
    ],
  };
}

const save = (name = "Taverna del Cinghiale", scene = tavern()) =>
  app.inject({ method: "POST", url: "/api/scene-library", payload: { name, scene, npcs: [goblin] } });

describe("/api/scene-library", () => {
  it("saves the current scene and lists it with name, thumbnail and date", async () => {
    const res = await save();
    expect(res.statusCode).toBe(201);
    const summary = res.json();
    expect(summary).toMatchObject({ name: "Taverna del Cinghiale", thumbnailUrl: "/uploads/taverna.jpg", npcCount: 1 });
    expect(Date.parse(summary.createdAt)).not.toBeNaN();
    expect((await app.inject({ method: "GET", url: "/api/scene-library" })).json()).toEqual([summary]);

    const full = (await app.inject({ method: "GET", url: `/api/scene-library/${summary.id}` })).json();
    expect(full.scene).not.toHaveProperty("explored");
    expect(full.scene).not.toHaveProperty("shownToPlayers");
    expect(full.scene.tokens.map((t: { ref: { kind: string } }) => t.ref.kind)).toEqual(["npc"]);
    expect(full.npcs.map((n: Npc) => n.name)).toEqual(["Goblin"]);
  });

  it("rejects invalid saves", async () => {
    expect((await save("   ")).statusCode).toBe(400);
    const bad = await app.inject({ method: "POST", url: "/api/scene-library", payload: { name: "X", scene: { nome: "non una scena" } } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().issues).toBeInstanceOf(Array);
  });

  it("loads a saved scene as a new one, placing the PCs at the starting point", async () => {
    const { id } = (await save()).json();
    const res = await app.inject({ method: "POST", url: `/api/scene-library/${id}/load`, payload: { pcs: [{ ref: { kind: "pc", id: "aria" }, size: 1 }] } });
    expect(res.statusCode).toBe(200);
    const { scene, npcs } = res.json() as { scene: Scene; npcs: Npc[] };
    expect(scene.name).toBe("Taverna del Cinghiale");
    expect(scene.explored).toEqual([]);
    expect(scene.shownToPlayers).toBe(false);
    expect(npcs).toHaveLength(1);
    expect(npcs[0]!.id).not.toBe("g1");
    const pc = scene.tokens.find((t) => t.ref.kind === "pc")!;
    expect(Math.max(Math.abs(pc.x - 3), Math.abs(pc.y - 3))).toBe(1); // la cella di partenza è del goblin
    // caricare non scrive nulla: le scene attive sono quelle di prima
    expect((await app.inject({ method: "GET", url: "/api/scenes" })).json()).toEqual([]);
    // senza PG
    const empty = (await app.inject({ method: "POST", url: `/api/scene-library/${id}/load` })).json() as { scene: Scene };
    expect(empty.scene.tokens.every((t) => t.ref.kind === "npc")).toBe(true);
    // solo PG
    const npcRef = await app.inject({ method: "POST", url: `/api/scene-library/${id}/load`, payload: { pcs: [{ ref: { kind: "npc", id: "x" }, size: 1 }] } });
    expect(npcRef.statusCode).toBe(400);
  });

  it("duplicates without copying image files", async () => {
    writeFileSync(join(dir, "uploads", "taverna.jpg"), "jpg");
    const { id } = (await save()).json();
    const dup = await app.inject({ method: "POST", url: `/api/scene-library/${id}/duplicate`, payload: {} });
    expect(dup.statusCode).toBe(201);
    expect(dup.json()).toMatchObject({ name: "Taverna del Cinghiale (copia)", thumbnailUrl: "/uploads/taverna.jpg" });
    expect(dup.json().id).not.toBe(id);
    const named = await app.inject({ method: "POST", url: `/api/scene-library/${id}/duplicate`, payload: { name: "Taverna in fiamme" } });
    expect(named.json().name).toBe("Taverna in fiamme");
    expect((await app.inject({ method: "GET", url: "/api/scene-library" })).json()).toHaveLength(3);
    expect(readdirSync(join(dir, "uploads"))).toEqual(["taverna.jpg"]);
  });

  it("renames and deletes", async () => {
    const { id } = (await save()).json();
    const renamed = await app.inject({ method: "PATCH", url: `/api/scene-library/${id}`, payload: { name: "  Locanda  " } });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().name).toBe("Locanda");
    expect((await app.inject({ method: "PATCH", url: `/api/scene-library/${id}`, payload: { name: "" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "DELETE", url: `/api/scene-library/${id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/api/scene-library" })).json()).toEqual([]);
  });

  it("answers 404 for unknown scenes", async () => {
    for (const [method, url] of [
      ["GET", "/api/scene-library/nessuna"],
      ["POST", "/api/scene-library/nessuna/load"],
      ["POST", "/api/scene-library/nessuna/duplicate"],
      ["DELETE", "/api/scene-library/nessuna"],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(404);
    }
    expect((await app.inject({ method: "PATCH", url: "/api/scene-library/nessuna", payload: { name: "X" } })).statusCode).toBe(404);
  });

  it("is part of the full export and import", async () => {
    await save();
    const file = (await app.inject({ method: "GET", url: "/api/export" })).json();
    expect(file.sceneLibrary).toHaveLength(1);
    const target = await buildApp({ dbPath: ":memory:", uploadsDir: join(dir, "uploads2"), logger: false });
    try {
      expect((await target.inject({ method: "POST", url: "/api/import", payload: file })).json()).toMatchObject({ sceneLibrary: 1 });
      expect((await target.inject({ method: "GET", url: "/api/scene-library" })).json().map((s: { name: string }) => s.name)).toEqual(["Taverna del Cinghiale"]);
    } finally {
      await target.close();
    }
  });
});

describe("database migration", () => {
  it("upgrades a database made before the library without losing the current scenes", async () => {
    const path = join(dir, "old.db");
    // schema della prima versione: niente rev, niente user_version, niente saved_scenes
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE documents (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (collection, id));
      CREATE TABLE document_history (collection TEXT NOT NULL, id TEXT NOT NULL, rev INTEGER NOT NULL, data TEXT NOT NULL, archived_at INTEGER NOT NULL, PRIMARY KEY (collection, id, rev));
    `);
    const { pcStart: _pcStart, ...scene } = { ...newScene("Cripta"), tokens: [{ id: "t", ref: { kind: "pc" as const, id: "aria" }, x: 2, y: 2 }] };
    old.prepare("INSERT INTO documents VALUES ('scenes', ?, ?, '2025-01-01T00:00:00.000Z')").run(scene.id, JSON.stringify(scene));
    old.close();

    await app.close();
    app = await buildApp({ dbPath: path, uploadsDir: join(dir, "uploads"), logger: false });
    const scenes = (await app.inject({ method: "GET", url: "/api/scenes" })).json();
    expect(scenes).toEqual([{ rev: 1, data: scene }]);
    expect((await save("Dalla cripta", scenes[0].data)).statusCode).toBe(201);
    await app.close();

    const check = new DatabaseSync(path);
    expect((check.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(SCHEMA_VERSION);
    expect((check.prepare("SELECT name FROM saved_scenes").all() as { name: string }[]).map((r) => r.name)).toEqual(["Dalla cripta"]);
    check.close();

    // riaprire non riapplica le migrazioni né perde nulla
    app = await buildApp({ dbPath: path, uploadsDir: join(dir, "uploads"), logger: false });
    expect((await app.inject({ method: "GET", url: "/api/scene-library" })).json()).toHaveLength(1);
    expect((await app.inject({ method: "GET", url: "/api/scenes" })).json()).toHaveLength(1);
  });
});
