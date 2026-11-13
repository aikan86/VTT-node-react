import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { emptyCombat, newCharacter, newDmRoll, newScene } from "@vtt/shared";
import { buildApp } from "../src/app";

let app: FastifyInstance;
let uploadsDir: string;

beforeEach(async () => {
  uploadsDir = mkdtempSync(join(tmpdir(), "vtt-uploads-"));
  app = await buildApp({ dbPath: ":memory:", uploadsDir, logger: false });
});

afterEach(async () => {
  await app.close();
  rmSync(uploadsDir, { recursive: true, force: true });
});

describe("/api/characters", () => {
  it("creates, lists, updates and deletes a character", async () => {
    const pc = newCharacter({ name: "Aragorn", initiativeMod: 2 });

    const created = await app.inject({ method: "POST", url: "/api/characters", payload: pc });
    expect(created.statusCode).toBe(201);

    const list = await app.inject({ method: "GET", url: "/api/characters" });
    expect(list.json()).toEqual([{ rev: 1, data: pc }]);

    const updated = { ...pc, ac: 17, hp: { current: 5, max: 30, temp: 0 } };
    const put = await app.inject({ method: "PUT", url: `/api/characters/${pc.id}`, payload: updated, headers: { "if-match": "1" } });
    expect(put.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/characters" })).json()).toEqual([{ rev: 2, data: updated }]);

    const del = await app.inject({ method: "DELETE", url: `/api/characters/${pc.id}` });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/api/characters" })).json()).toEqual([]);
  });

  it("keeps extra fields for future extensions", async () => {
    const pc = { ...newCharacter(), speed: 30 };
    await app.inject({ method: "POST", url: "/api/characters", payload: pc });
    const [saved] = (await app.inject({ method: "GET", url: "/api/characters" })).json();
    expect(saved.data.speed).toBe(30);
  });

  it("rejects invalid bodies with 400 and issues", async () => {
    const res = await app.inject({ method: "POST", url: "/api/characters", payload: { ...newCharacter(), ac: "alta" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toBeInstanceOf(Array);
  });

  it("rejects duplicate ids on create with 409", async () => {
    const pc = newCharacter();
    await app.inject({ method: "POST", url: "/api/characters", payload: pc });
    const res = await app.inject({ method: "POST", url: "/api/characters", payload: pc });
    expect(res.statusCode).toBe(409);
  });

  it("rejects PUT when the body id differs from the url", async () => {
    const pc = newCharacter();
    const res = await app.inject({ method: "PUT", url: "/api/characters/altro", payload: pc, headers: { "if-match": "1" } });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for unknown ids", async () => {
    const pc = newCharacter();
    expect((await app.inject({ method: "PUT", url: `/api/characters/${pc.id}`, payload: pc, headers: { "if-match": "1" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/api/characters/${pc.id}` })).statusCode).toBe(404);
  });
});

describe("/api/scenes", () => {
  it("creates, reads, replaces and deletes a scene", async () => {
    const scene = newScene("Caverna");
    expect((await app.inject({ method: "POST", url: "/api/scenes", payload: scene })).statusCode).toBe(201);
    expect((await app.inject({ method: "GET", url: `/api/scenes/${scene.id}` })).json()).toEqual({ rev: 1, data: scene });

    const withToken = { ...scene, tokens: [{ id: "t1", ref: { kind: "pc", id: "p1" }, x: 2, y: 3 }] };
    expect((await app.inject({ method: "PUT", url: `/api/scenes/${scene.id}`, payload: withToken, headers: { "if-match": "1" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/scenes" })).json()).toEqual([{ rev: 2, data: withToken }]);

    expect((await app.inject({ method: "DELETE", url: `/api/scenes/${scene.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: `/api/scenes/${scene.id}` })).statusCode).toBe(404);
  });

  it("validates nested layer objects", async () => {
    const scene = newScene();
    const bad = { ...scene, effects: [{ id: "e", shape: "star", x: 0, y: 0, sizeFt: 10, rotation: 0, color: "#ff0000", opacity: 0.5 }] };
    expect((await app.inject({ method: "POST", url: "/api/scenes", payload: bad })).statusCode).toBe(400);
  });
});

describe("/api/dm-rolls", () => {
  it("records, lists and deletes d20 rolls", async () => {
    const roll = newDmRoll(20);
    expect((await app.inject({ method: "POST", url: "/api/dm-rolls", payload: roll })).statusCode).toBe(201);
    expect((await app.inject({ method: "GET", url: "/api/dm-rolls" })).json()).toEqual([{ rev: 1, data: roll }]);
    expect((await app.inject({ method: "DELETE", url: `/api/dm-rolls/${roll.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/api/dm-rolls" })).json()).toEqual([]);
  });

  it("rejects results outside 1..20", async () => {
    const roll = { ...newDmRoll(1), value: 21 };
    expect((await app.inject({ method: "POST", url: "/api/dm-rolls", payload: roll })).statusCode).toBe(400);
  });
});

describe("/api/combat", () => {
  it("returns an empty combat by default and persists updates", async () => {
    expect((await app.inject({ method: "GET", url: "/api/combat" })).json()).toEqual({ rev: 0, data: emptyCombat() });
    const combat = {
      ...emptyCombat(),
      active: true,
      round: 3,
      currentId: "c1",
      combatants: [{ id: "c1", ref: { kind: "pc", id: "p1" }, roll: 12, acted: false, order: 0, notes: "Prono" }],
    };
    expect((await app.inject({ method: "PUT", url: "/api/combat", payload: combat, headers: { "if-match": "0" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/combat" })).json()).toEqual({ rev: 1, data: combat });
  });

  it("fills in empty notes for combatants saved before notes existed", async () => {
    const legacy = { ...emptyCombat(), combatants: [{ id: "c1", ref: { kind: "pc", id: "p1" }, roll: null, acted: false, order: 0 }] };
    expect((await app.inject({ method: "PUT", url: "/api/combat", payload: legacy, headers: { "if-match": "0" } })).statusCode).toBe(200);
    const res = (await app.inject({ method: "GET", url: "/api/combat" })).json();
    expect(res.data.combatants[0].notes).toBe("");
  });

  it("rejects an invalid d20 roll", async () => {
    const combat = { ...emptyCombat(), combatants: [{ id: "c1", ref: { kind: "pc", id: "p1" }, roll: 25, acted: false, order: 0 }] };
    expect((await app.inject({ method: "PUT", url: "/api/combat", payload: combat, headers: { "if-match": "0" } })).statusCode).toBe(400);
  });
});

function multipart(filename: string, contentType: string, content: Buffer) {
  const boundary = "----vtttest";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload: body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

describe("/api/uploads", () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

  it("stores an image and serves it statically", async () => {
    const res = await app.inject({ method: "POST", url: "/api/uploads", ...multipart("mappa.png", "image/png", png) });
    expect(res.statusCode).toBe(201);
    const { url } = res.json();
    expect(url).toMatch(/^\/uploads\/[0-9a-f-]+\.png$/);
    expect(readdirSync(uploadsDir)).toHaveLength(1);

    const file = await app.inject({ method: "GET", url });
    expect(file.statusCode).toBe(200);
    expect(file.rawPayload.equals(png)).toBe(true);
  });

  it("rejects non-image files", async () => {
    const res = await app.inject({ method: "POST", url: "/api/uploads", ...multipart("x.txt", "text/plain", Buffer.from("ciao")) });
    expect(res.statusCode).toBe(415);
    expect(readdirSync(uploadsDir)).toHaveLength(0);
  });
});
