import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { IMAGE_TYPES, SrdIndexSchema } from "@vtt/shared";

/** Archivio online delle regole SRD 5e: per molti mostri ha anche un'illustrazione (gratuita, secondo i manutentori). */
export const SRD_BASE = "https://www.dnd5eapi.co";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/**
 * Legge il corpo della risposta fermandosi appena supera `max` byte (null in quel caso): il timeout limita il tempo,
 * non la dimensione, e un'immagine enorme non deve finire tutta in memoria prima del controllo.
 */
export async function readLimited(res: Response, max: number): Promise<Buffer | null> {
  if (Number(res.headers.get("content-length")) > max) {
    await res.body?.cancel();
    return null;
  }
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const cachedName = (uploadsDir: string, index: string) =>
  Object.values(IMAGE_TYPES)
    .map((ext) => `srd-${index}.${ext}`)
    .find((name) => existsSync(join(uploadsDir, name)));

/**
 * Illustrazione di un mostro dall'SRD online, scaricata una volta sola tra le immagini del VTT (`/uploads/srd-<nome>.png`):
 * dopo funziona senza internet e finisce nell'esportazione. Al servizio esterno arriva solo il nome del mostro.
 */
type Outcome = { code: 200; body: { url: string; cached: boolean } } | { code: 404 | 502; body: { error: string } };

const OFFLINE: Outcome = { code: 502, body: { error: "Archivio SRD non raggiungibile: controlla la connessione a internet" } };

export function registerSrdImageRoutes(app: FastifyInstance, uploadsDir: string, fetchImpl: FetchLike = fetch) {
  const get = (url: string) => fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });

  const download = async (index: string): Promise<Outcome> => {
    let meta: Response;
    try {
      meta = await get(`${SRD_BASE}/api/2014/monsters/${index}`);
    } catch {
      return OFFLINE;
    }
    if (meta.status === 404) return { code: 404, body: { error: "Mostro non presente nell'SRD 5e" } };
    if (!meta.ok) return { code: 502, body: { error: `Archivio SRD: errore ${meta.status}` } };
    const body = (await meta.json().catch(() => null)) as { image?: unknown } | null;
    const path = body?.image;
    if (typeof path !== "string" || !path.startsWith("/api/images/")) return { code: 404, body: { error: "Nessuna illustrazione per questo mostro" } };

    let image: Response;
    try {
      image = await get(`${SRD_BASE}${path}`);
    } catch {
      return OFFLINE;
    }
    const type = (image.headers.get("content-type") ?? "").split(";")[0]!.trim();
    const ext = (IMAGE_TYPES as Record<string, string>)[type];
    if (!image.ok || !ext) {
      await image.body?.cancel().catch(() => {});
      return { code: 502, body: { error: "L'illustrazione non è un'immagine utilizzabile" } };
    }
    let data: Buffer | null;
    try {
      data = await readLimited(image, MAX_IMAGE_BYTES);
    } catch {
      return OFFLINE;
    }
    if (!data) return { code: 502, body: { error: "Illustrazione troppo grande" } };

    const name = `srd-${index}.${ext}`;
    writeFileSync(join(uploadsDir, name), data);
    return { code: 200, body: { url: `/uploads/${name}`, cached: false } };
  };

  // richieste uguali in contemporanea (due schede, due clic): un solo scaricamento
  const inFlight = new Map<string, Promise<Outcome>>();

  app.get<{ Params: { index: string } }>("/api/srd-image/:index", async (req, reply) => {
    const parsed = SrdIndexSchema.safeParse(req.params.index);
    if (!parsed.success) return reply.code(400).send({ error: "Nome del mostro non valido" });
    const index = parsed.data;

    const cached = cachedName(uploadsDir, index);
    if (cached) return { url: `/uploads/${cached}`, cached: true };

    let pending = inFlight.get(index);
    if (!pending) {
      pending = download(index).finally(() => inFlight.delete(index));
      inFlight.set(index, pending);
    }
    const outcome = await pending;
    return reply.code(outcome.code).send(outcome.body);
  });
}
