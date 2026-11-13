import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildApp } from "./app";

const root = resolve(import.meta.dirname, "../../..");
const dataDir = resolve(process.env.VTT_DATA_DIR ?? join(root, "data"));
mkdirSync(dataDir, { recursive: true });

const production = process.env.NODE_ENV === "production";
const app = await buildApp({
  dbPath: join(dataDir, "vtt.sqlite"),
  uploadsDir: join(dataDir, "uploads"),
  clientDist: production ? join(root, "apps/client/dist") : undefined,
});

const port = Number(process.env.PORT ?? 3001);
// Solo locale per ora: per il multiplayer basterà HOST=0.0.0.0
const host = process.env.HOST ?? "127.0.0.1";

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void app.close().then(() => process.exit(0)));
}
