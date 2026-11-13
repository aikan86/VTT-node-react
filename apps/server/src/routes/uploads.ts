import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function registerUploadRoutes(app: FastifyInstance, uploadsDir: string) {
  app.post("/api/uploads", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "Nessun file ricevuto" });

    const ext = IMAGE_TYPES[file.mimetype];
    if (!ext) {
      file.file.resume();
      return reply.code(415).send({ error: "Sono accettate solo immagini PNG, JPEG, WebP o GIF" });
    }

    const name = `${randomUUID()}.${ext}`;
    const target = join(uploadsDir, name);
    await pipeline(file.file, createWriteStream(target));
    if (file.file.truncated) {
      await unlink(target);
      return reply.code(413).send({ error: "Immagine troppo grande" });
    }
    return reply.code(201).send({ url: `/uploads/${name}` });
  });
}
