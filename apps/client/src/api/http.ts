import {
  CLIENT_ID_HEADER,
  createId,
  type Character,
  type Combat,
  type DmRoll,
  type Handout,
  type LoadedScene,
  type LoadSceneRequest,
  type Monster,
  type SavedSceneSummary,
  type SaveSceneRequest,
  type NpcGroup,
  type Scene,
  type Versioned,
} from "@vtt/shared";
import type { SaveResult } from "../store/sync/docSync";

/** Identifica questo tab: il server lo rimanda negli eventi, così il tab ignora le proprie modifiche. */
export const CLIENT_ID = createId();

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown = null,
  ) {
    super(message);
  }
}

/** Errori per cui riprovare non serve (dati rifiutati dal server). */
export const isPermanentError = (err: unknown) =>
  err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;

async function request<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const res = await fetch(url, {
    method,
    headers: {
      [CLIENT_ID_HEADER]: CLIENT_ID,
      ...(payload === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: payload,
    // permette ai salvataggi in coda di completarsi anche se la pagina viene chiusa (limite browser ~64KB)
    keepalive: method !== "GET" && (payload?.length ?? 0) < 60_000,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, data?.error ?? `Errore ${res.status}`, data);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** PUT condizionato alla versione: 409 = un altro tab ha salvato prima, 404 = eliminato altrove. */
async function conditionalPut<T>(url: string, doc: unknown, baseRev: number): Promise<SaveResult<T>> {
  try {
    const saved = await request<Versioned<T>>("PUT", url, doc, { "if-match": String(baseRev) });
    return { status: "ok", rev: saved.rev };
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return { status: "conflict", current: (err.body as { current: Versioned<T> }).current };
    }
    if (err instanceof ApiError && err.status === 404) return { status: "gone" };
    throw err;
  }
}

function collection<T extends { id: string }>(base: string) {
  return {
    list: () => request<Versioned<T>[]>("GET", base),
    create: (doc: T) => request<Versioned<T>>("POST", base, doc),
    update: (doc: T, baseRev: number) => conditionalPut<T>(`${base}/${encodeURIComponent(doc.id)}`, doc, baseRev),
    remove: (id: string) => request<void>("DELETE", `${base}/${encodeURIComponent(id)}`),
  };
}

export const api = {
  characters: collection<Character>("/api/characters"),
  scenes: collection<Scene>("/api/scenes"),
  dmRolls: collection<DmRoll>("/api/dm-rolls"),
  handouts: collection<Handout>("/api/handouts"),
  monsters: collection<Monster>("/api/monsters"),
  npcGroups: collection<NpcGroup>("/api/npc-groups"),
  sceneLibrary: {
    list: () => request<SavedSceneSummary[]>("GET", "/api/scene-library"),
    save: (body: SaveSceneRequest) => request<SavedSceneSummary>("POST", "/api/scene-library", body),
    load: (id: string, body: LoadSceneRequest) => request<LoadedScene>("POST", `/api/scene-library/${encodeURIComponent(id)}/load`, body),
    duplicate: (id: string, name?: string) =>
      request<SavedSceneSummary>("POST", `/api/scene-library/${encodeURIComponent(id)}/duplicate`, name === undefined ? {} : { name }),
    rename: (id: string, name: string) => request<SavedSceneSummary>("PATCH", `/api/scene-library/${encodeURIComponent(id)}`, { name }),
    remove: (id: string) => request<void>("DELETE", `/api/scene-library/${encodeURIComponent(id)}`),
  },
  combat: {
    get: () => request<Versioned<Combat>>("GET", "/api/combat"),
    put: (combat: Combat, baseRev: number) => conditionalPut<Combat>("/api/combat", combat, baseRev),
  },
  async upload(file: File): Promise<{ url: string }> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: form, headers: { [CLIENT_ID_HEADER]: CLIENT_ID } });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new ApiError(res.status, data?.error ?? `Errore ${res.status}`, data);
    }
    return (await res.json()) as { url: string };
  },
  /** Illustrazione di un mostro dall'SRD 5e online, scaricata dal server tra le immagini del VTT. */
  srdImage: (index: string) => request<{ url: string; cached: boolean }>("GET", `/api/srd-image/${encodeURIComponent(index)}`),
  /** Indirizzo che scarica l'intero stato come file JSON. */
  exportUrl: "/api/export",
  /** Sostituisce l'intero stato con quello del file esportato (inviato così com'è, senza rielaborarlo). */
  async importState(file: Blob): Promise<void> {
    const res = await fetch("/api/import", {
      method: "POST",
      body: file,
      headers: { "content-type": "application/json", [CLIENT_ID_HEADER]: CLIENT_ID },
    });
    if (res.ok) return;
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    const message =
      res.status === 400
        ? "File non valido: non è un salvataggio VTT compatibile"
        : res.status === 413
          ? "File troppo grande"
          : (data?.error ?? `Errore ${res.status}`);
    throw new ApiError(res.status, message, data);
  },
};
