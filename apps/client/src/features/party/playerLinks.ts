import { useEffect, useState } from "react";

export interface ServerInfo {
  /** Indirizzo su cui il server ascolta (null se non noto). */
  listenHost: string | null;
  /** Indirizzi IPv4 del PC sulla rete locale. */
  addresses: string[];
}

export interface LinkBase {
  /** Inizio dei link, es. "http://192.168.1.20:3001". */
  base: string;
  /** Avviso per il master se i link potrebbero non funzionare dal telefono. */
  note: string | null;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
export const isLoopback = (host: string) => LOOPBACK.has(host) || host.endsWith(".localhost");

const ONLY_THIS_PC =
  "Il server accetta solo connessioni da questo PC: per i telefoni riavvialo con HOST=0.0.0.0 (VTT_HOST con pnpm prod), con i telefoni sulla stessa rete Wi-Fi.";

/**
 * Indirizzo da mettere nei link per i telefoni. Se il master ha aperto l'app come "localhost" (che dal telefono
 * non funziona) si usa l'indirizzo di rete del PC, e si avvisa se il server non accetta connessioni dalla rete.
 */
export function playerLinkBase(loc: Pick<Location, "protocol" | "hostname" | "port">, info: ServerInfo | null): LinkBase {
  const port = loc.port ? `:${loc.port}` : "";
  const listensOnlyHere = info?.listenHost != null && isLoopback(info.listenHost);
  if (!isLoopback(loc.hostname)) {
    return { base: `${loc.protocol}//${loc.hostname}${port}`, note: listensOnlyHere ? ONLY_THIS_PC : null };
  }
  const lan = info?.addresses[0];
  if (!lan) {
    return {
      base: `${loc.protocol}//${loc.hostname}${port}`,
      note: "Questi link usano \"localhost\", che dal telefono non funziona: collega il PC alla rete e apri l'app con il suo indirizzo di rete.",
    };
  }
  return { base: `${loc.protocol}//${lan}${port}`, note: listensOnlyHere ? ONLY_THIS_PC : null };
}

export const playerLink = (base: string, pcId: string) => `${base}/giocatori/${encodeURIComponent(pcId)}`;

/** Indirizzo dei link per i giocatori, chiedendo al server i suoi indirizzi di rete. */
export function usePlayerLinkBase(): LinkBase {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/server-info")
      .then((r) => (r.ok ? (r.json() as Promise<ServerInfo>) : null))
      .then((data) => {
        if (!cancelled && data) setInfo(data);
      })
      .catch(() => undefined); // senza informazioni si usa l'indirizzo della pagina
    return () => {
      cancelled = true;
    };
  }, []);
  return playerLinkBase(window.location, info);
}
