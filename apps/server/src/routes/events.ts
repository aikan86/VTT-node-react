import type { ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import type { ChangeBus } from "../events";

const HEARTBEAT_MS = 25_000;

/** Server-Sent Events: ogni modifica a un documento viene inviata a tutti i tab connessi. */
export function registerEventRoutes(app: FastifyInstance, bus: ChangeBus) {
  const open = new Set<ServerResponse>();

  app.get("/api/events", (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write("retry: 2000\n\n");
    open.add(res);

    const unsubscribe = bus.subscribe((change) => res.write(`data: ${JSON.stringify(change)}\n\n`));
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    req.raw.on("close", () => {
      unsubscribe();
      clearInterval(heartbeat);
      open.delete(res);
    });
  });

  // Le connessioni SSE restano aperte: vanno chiuse esplicitamente allo spegnimento.
  app.addHook("preClose", async () => {
    for (const res of open) res.end();
  });
}
