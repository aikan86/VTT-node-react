import type { Character, Combat, DmRoll, Scene } from "@vtt/shared";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const res = await fetch(url, {
    method,
    headers: payload === undefined ? undefined : { "content-type": "application/json" },
    body: payload,
    // permette ai salvataggi in coda di completarsi anche se la pagina viene chiusa (limite browser ~64KB)
    keepalive: method !== "GET" && (payload?.length ?? 0) < 60_000,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, data?.error ?? `Errore ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

function collection<T extends { id: string }>(base: string) {
  return {
    list: () => request<T[]>("GET", base),
    create: (doc: T) => request<T>("POST", base, doc),
    update: (doc: T) => request<T>("PUT", `${base}/${encodeURIComponent(doc.id)}`, doc),
    remove: (id: string) => request<void>("DELETE", `${base}/${encodeURIComponent(id)}`),
  };
}

export const api = {
  characters: collection<Character>("/api/characters"),
  scenes: collection<Scene>("/api/scenes"),
  dmRolls: collection<DmRoll>("/api/dm-rolls"),
  combat: {
    get: () => request<Combat>("GET", "/api/combat"),
    put: (combat: Combat) => request<Combat>("PUT", "/api/combat", combat),
  },
  async upload(file: File): Promise<{ url: string }> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new ApiError(res.status, data?.error ?? `Errore ${res.status}`);
    }
    return (await res.json()) as { url: string };
  },
};
