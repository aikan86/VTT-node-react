import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { CLIENT_ID_HEADER, emptyCombat, newCharacter, type DocChange } from "@vtt/shared";
import { buildApp, type AppOptions } from "../src/app";

let app: FastifyInstance;
let uploadsDir: string;
let clock = 0;

async function start(history: AppOptions["history"] = {}) {
  uploadsDir = mkdtempSync(join(tmpdir(), "vtt-uploads-"));
  clock = 1_000_000;
  app = await buildApp({ dbPath: ":memory:", uploadsDir, logger: false, history: { now: () => clock, ...history } });
}

afterEach(async () => {
  await app?.close();
  rmSync(uploadsDir, { recursive: true, force: true });
});

const put = (url: string, payload: unknown, rev?: number, client = "tab-a") =>
  app.inject({
    method: "PUT",
    url,
    payload: payload as object,
    headers: { ...(rev === undefined ? {} : { "if-match": String(rev) }), [CLIENT_ID_HEADER]: client },
  });

describe("optimistic versions", () => {
  it("starts documents at rev 1 and increments on each write", async () => {
    await start();
    const pc = newCharacter({ name: "Aria" });
    const created = await app.inject({ method: "POST", url: "/api/characters", payload: pc });
    expect(created.json()).toEqual({ rev: 1, data: pc });

    const res = await put(`/api/characters/${pc.id}`, { ...pc, ac: 16 }, 1);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ rev: 2, data: { ...pc, ac: 16 } });
    expect((await app.inject({ method: "GET", url: "/api/characters" })).json()).toEqual([{ rev: 2, data: { ...pc, ac: 16 } }]);
  });

  it("rejects a write based on a stale rev with 409 and the current document", async () => {
    await start();
    const pc = newCharacter({ name: "Aria" });
    await app.inject({ method: "POST", url: "/api/characters", payload: pc });
    await put(`/api/characters/${pc.id}`, { ...pc, ac: 16 }, 1); // tab A -> rev 2

    const stale = await put(`/api/characters/${pc.id}`, { ...pc, notes: "vecchio" }, 1, "tab-b");
    expect(stale.statusCode).toBe(409);
    expect(stale.json().current).toEqual({ rev: 2, data: { ...pc, ac: 16 } });
    expect((await app.inject({ method: "GET", url: `/api/characters/${pc.id}` })).json().data.ac).toBe(16);
  });

  it("refuses unversioned writes (e.g. a tab still running an old version of the app)", async () => {
    await start();
    const pc = newCharacter({ name: "Aria" });
    await app.inject({ method: "POST", url: "/api/characters", payload: pc });
    expect((await app.inject({ method: "PUT", url: `/api/characters/${pc.id}`, payload: pc })).statusCode).toBe(428);
    expect((await app.inject({ method: "PUT", url: "/api/combat", payload: emptyCombat() })).statusCode).toBe(428);
  });

  it("rejects a malformed If-Match header", async () => {
    await start();
    const pc = newCharacter({ name: "Aria" });
    await app.inject({ method: "POST", url: "/api/characters", payload: pc });
    const res = await app.inject({ method: "PUT", url: `/api/characters/${pc.id}`, payload: pc, headers: { "if-match": "abc" } });
    expect(res.statusCode).toBe(400);
  });

  it("versions the combat singleton starting from rev 0", async () => {
    await start();
    expect((await app.inject({ method: "GET", url: "/api/combat" })).json()).toEqual({ rev: 0, data: emptyCombat() });
    const first = await put("/api/combat", { ...emptyCombat(), round: 1 }, 0);
    expect(first.json()).toEqual({ rev: 1, data: { ...emptyCombat(), round: 1 } });

    const stale = await put("/api/combat", { ...emptyCombat(), round: 7 }, 0, "tab-b");
    expect(stale.statusCode).toBe(409);
    expect(stale.json().current).toEqual({ rev: 1, data: { ...emptyCombat(), round: 1 } });
  });
});

describe("history", () => {
  it("keeps previous versions, coalescing bursts of writes", async () => {
    await start({ coalesceMs: 5000 });
    await put("/api/combat", { ...emptyCombat(), round: 1 }, 0); // rev 1
    clock += 1000;
    await put("/api/combat", { ...emptyCombat(), round: 2 }, 1); // archivia rev 1
    clock += 1000;
    await put("/api/combat", { ...emptyCombat(), round: 3 }, 2); // burst: rev 2 non archiviata
    clock += 10_000;
    await put("/api/combat", { ...emptyCombat(), round: 4 }, 3); // archivia rev 3

    const history = (await app.inject({ method: "GET", url: "/api/history/combat/current" })).json();
    expect(history.map((v: { rev: number; current: boolean }) => [v.rev, v.current])).toEqual([
      [4, true],
      [3, false],
      [1, false],
    ]);
  });

  it("limits the number of archived versions per document", async () => {
    await start({ coalesceMs: 0, limit: 3 });
    for (let round = 1; round <= 6; round++) await put("/api/combat", { ...emptyCombat(), round }, round - 1);
    const history = (await app.inject({ method: "GET", url: "/api/history/combat/current" })).json();
    expect(history.map((v: { rev: number }) => v.rev)).toEqual([6, 5, 4, 3]);
  });

  it("restores an old version as a new revision", async () => {
    await start({ coalesceMs: 0 });
    await put("/api/combat", { ...emptyCombat(), round: 3 }, 0);
    await put("/api/combat", { ...emptyCombat(), round: 0 }, 1);
    const res = await app.inject({ method: "POST", url: "/api/history/combat/current/restore", payload: { rev: 1 } });
    expect(res.json()).toEqual({ rev: 3, data: { ...emptyCombat(), round: 3 } });
    expect((await app.inject({ method: "GET", url: "/api/combat" })).json().data.round).toBe(3);
  });

  it("recovers a deleted document", async () => {
    await start();
    const pc = newCharacter({ name: "Borin" });
    await app.inject({ method: "POST", url: "/api/characters", payload: pc });
    await app.inject({ method: "DELETE", url: `/api/characters/${pc.id}` });

    const index = (await app.inject({ method: "GET", url: "/api/history" })).json();
    expect(index).toContainEqual(expect.objectContaining({ collection: "characters", id: pc.id, label: "Borin", deleted: true }));

    const res = await app.inject({ method: "POST", url: `/api/history/characters/${pc.id}/restore`, payload: { rev: 1 } });
    expect(res.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/characters/${pc.id}` })).json().data.name).toBe("Borin");
  });

  it("returns 404 for an unknown version", async () => {
    await start();
    const res = await app.inject({ method: "POST", url: "/api/history/combat/current/restore", payload: { rev: 9 } });
    expect(res.statusCode).toBe(404);
  });
});

describe("live events", () => {
  it("streams every change with its origin to connected clients", async () => {
    await start();
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const controller = new AbortController();
    const res = await fetch(`${address}/api/events`, { signal: controller.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    const received: DocChange[] = [];
    const next = async () => {
      let buffer = "";
      while (!buffer.includes("data: ")) buffer += decoder.decode((await reader.read()).value);
      for (const line of buffer.split("\n")) if (line.startsWith("data: ")) received.push(JSON.parse(line.slice(6)));
    };

    const pc = newCharacter({ name: "Aria" });
    await fetch(`${address}/api/characters`, {
      method: "POST",
      headers: { "content-type": "application/json", [CLIENT_ID_HEADER]: "tab-a" },
      body: JSON.stringify(pc),
    });
    await next();
    expect(received[0]).toEqual({ collection: "characters", id: pc.id, rev: 1, data: pc, origin: "tab-a" });

    await fetch(`${address}/api/characters/${pc.id}`, { method: "DELETE" });
    await next();
    expect(received.at(-1)).toMatchObject({ collection: "characters", id: pc.id, data: null, origin: null });
    controller.abort();
  });
});
