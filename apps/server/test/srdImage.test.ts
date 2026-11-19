import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import type { FetchLike } from "../src/routes/srdImage";

const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
let app: FastifyInstance;
let uploadsDir: string;

async function start(fetch: FetchLike) {
  uploadsDir = mkdtempSync(join(tmpdir(), "vtt-srd-"));
  app = await buildApp({ dbPath: ":memory:", uploadsDir, logger: false, fetch });
}

afterEach(async () => {
  await app.close();
  rmSync(uploadsDir, { recursive: true, force: true });
});

/** Finto archivio SRD: un goblin con illustrazione, un mostro senza. */
const fakeSrd = vi.fn<FetchLike>(async (url) => {
  if (url.endsWith("/api/2014/monsters/goblin")) return Response.json({ name: "Goblin", image: "/api/images/monsters/goblin.png" });
  if (url.endsWith("/api/2014/monsters/statue")) return Response.json({ name: "Statue" });
  if (url.endsWith("/api/images/monsters/goblin.png")) return new Response(png, { headers: { "content-type": "image/png" } });
  return new Response("not found", { status: 404 });
});

describe("/api/srd-image/:index", () => {
  it("downloads the illustration once and serves it from the VTT afterwards", async () => {
    fakeSrd.mockClear();
    await start(fakeSrd);
    const first = await app.inject({ method: "GET", url: "/api/srd-image/goblin" });
    expect(first.json()).toEqual({ url: "/uploads/srd-goblin.png", cached: false });
    expect(readFileSync(join(uploadsDir, "srd-goblin.png")).equals(png)).toBe(true);
    expect(fakeSrd.mock.calls.map(([url]) => url)).toEqual([
      "https://www.dnd5eapi.co/api/2014/monsters/goblin",
      "https://www.dnd5eapi.co/api/images/monsters/goblin.png",
    ]);

    const again = await app.inject({ method: "GET", url: "/api/srd-image/goblin" });
    expect(again.json()).toEqual({ url: "/uploads/srd-goblin.png", cached: true });
    expect(fakeSrd).toHaveBeenCalledTimes(2); // nessuna nuova richiesta
  });

  it("downloads only once when the same monster is asked twice at the same time", async () => {
    fakeSrd.mockClear();
    await start(fakeSrd);
    const [a, b] = await Promise.all([
      app.inject({ method: "GET", url: "/api/srd-image/goblin" }),
      app.inject({ method: "GET", url: "/api/srd-image/goblin" }),
    ]);
    expect(a.json().url).toBe("/uploads/srd-goblin.png");
    expect(b.json().url).toBe("/uploads/srd-goblin.png");
    expect(fakeSrd).toHaveBeenCalledTimes(2); // dati del mostro + immagine, una volta sola
  });

  it("says when the monster or its illustration does not exist", async () => {
    await start(fakeSrd);
    const missing = await app.inject({ method: "GET", url: "/api/srd-image/beholder-king" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toMatch(/non presente/);
    const noImage = await app.inject({ method: "GET", url: "/api/srd-image/statue" });
    expect(noImage.statusCode).toBe(404);
    expect(noImage.json().error).toMatch(/Nessuna illustrazione/);
  });

  it("reports when there is no internet", async () => {
    await start(async () => {
      throw new TypeError("fetch failed");
    });
    const res = await app.inject({ method: "GET", url: "/api/srd-image/goblin" });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatch(/connessione a internet/);
  });

  it("refuses non-images and odd names without calling anyone", async () => {
    const html = vi.fn<FetchLike>(async (url) =>
      url.includes("/monsters/") && !url.includes("/images/")
        ? Response.json({ image: "/api/images/monsters/x.png" })
        : new Response("<html>", { headers: { "content-type": "text/html" } }),
    );
    await start(html);
    expect((await app.inject({ method: "GET", url: "/api/srd-image/goblin" })).statusCode).toBe(502);
    expect(existsSync(join(uploadsDir, "srd-goblin.png"))).toBe(false);
    html.mockClear();
    expect((await app.inject({ method: "GET", url: "/api/srd-image/..%2Fsecret" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/srd-image/Goblin" })).statusCode).toBe(400);
    expect(html).not.toHaveBeenCalled();
  });

  it("stops downloading an illustration as soon as it exceeds the size limit", async () => {
    const MiB = 1024 * 1024;
    let pulled = 0;
    /** Immagine da 50 MiB servita a pezzi da 1 MiB, senza dichiararne la dimensione. */
    const huge = () =>
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pulled >= 50) return controller.close();
          pulled++;
          controller.enqueue(new Uint8Array(MiB));
        },
      });
    const big = vi.fn<FetchLike>(async (url) =>
      url.includes("/images/") ? new Response(huge(), { headers: { "content-type": "image/png" } }) : Response.json({ image: "/api/images/monsters/x.png" }),
    );
    await start(big);
    const res = await app.inject({ method: "GET", url: "/api/srd-image/goblin" });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatch(/troppo grande/);
    expect(pulled).toBeLessThanOrEqual(8); // 5 MiB di limite + qualche pezzo già in coda
    expect(existsSync(join(uploadsDir, "srd-goblin.png"))).toBe(false);
  });

  it("refuses an illustration that declares a size over the limit without reading it", async () => {
    let read = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull() {
          read = true;
        },
      },
      { highWaterMark: 0 }, // niente lettura anticipata: pull solo se qualcuno legge
    );
    await start(async (url) =>
      url.includes("/images/")
        ? new Response(body, { headers: { "content-type": "image/png", "content-length": String(100 * 1024 * 1024) } })
        : Response.json({ image: "/api/images/monsters/x.png" }),
    );
    const res = await app.inject({ method: "GET", url: "/api/srd-image/goblin" });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatch(/troppo grande/);
    expect(read).toBe(false);
  });
});
