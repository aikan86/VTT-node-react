import type { DocChange } from "@vtt/shared";
import { CLIENT_ID } from "./http";

export interface LiveHandlers {
  onChange: (change: DocChange) => void;
  /** Connessione (ri)stabilita: gli eventi persi nel frattempo vanno recuperati con una risincronizzazione. */
  onOpen: () => void;
  onStatus: (connected: boolean) => void;
}

/** Riceve in tempo reale le modifiche fatte da altri tab/dispositivi (Server-Sent Events). */
export function connectLive(handlers: LiveHandlers): () => void {
  if (typeof EventSource === "undefined") return () => undefined;
  const source = new EventSource("/api/events");
  source.onopen = () => {
    handlers.onStatus(true);
    handlers.onOpen();
  };
  source.onerror = () => handlers.onStatus(false); // EventSource si riconnette da solo
  source.onmessage = (event: MessageEvent<string>) => {
    let change: DocChange;
    try {
      change = JSON.parse(event.data) as DocChange;
    } catch {
      return;
    }
    if (change.origin !== CLIENT_ID) handlers.onChange(change);
  };
  return () => source.close();
}
