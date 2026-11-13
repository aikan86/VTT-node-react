import type { DocChange } from "@vtt/shared";

type Listener = (change: DocChange) => void;

/** Notifica le modifiche ai documenti (usato dal Repo, consumato da /api/events). */
export class ChangeBus {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(change: DocChange): void {
    for (const listener of this.listeners) listener(change);
  }
}
