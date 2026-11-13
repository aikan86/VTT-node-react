import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Versioned } from "@vtt/shared";
import { CollectionSync, type CollectionApi } from "./collectionSync";

interface Item {
  id: string;
  name: string;
}

function setup(initial: Versioned<Item>[] = []) {
  let server = new Map(initial.map((v) => [v.data.id, v]));
  const api: CollectionApi<Item> = {
    list: vi.fn(async () => [...server.values()]),
    create: vi.fn(async (doc: Item) => {
      const v = { rev: 1, data: doc };
      server.set(doc.id, v);
      return v;
    }),
    update: vi.fn(async (doc: Item, rev: number) => {
      const cur = server.get(doc.id);
      if (!cur) return { status: "gone" as const };
      if (cur.rev !== rev) return { status: "conflict" as const, current: cur };
      server.set(doc.id, { rev: rev + 1, data: doc });
      return { status: "ok" as const, rev: rev + 1 };
    }),
    remove: vi.fn(async (id: string) => {
      server.delete(id);
    }),
  };
  const onChange = vi.fn();
  const sync = new CollectionSync<Item>({ api, delayMs: 50, onChange, onError: vi.fn() });
  sync.hydrate(initial);
  return { sync, api, onChange, server: () => server, setServer: (m: typeof server) => (server = m) };
}

const v = (id: string, name: string, rev = 1): Versioned<Item> => ({ rev, data: { id, name } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("CollectionSync", () => {
  it("creates optimistically and saves later edits only after creation", async () => {
    const { sync, api, server } = setup();
    const done = sync.create({ id: "a", name: "Aria" });
    sync.update("a", (d) => ({ ...d, name: "Aria la Rossa" }));
    expect(sync.list).toEqual([{ id: "a", name: "Aria la Rossa" }]);
    await done;
    await vi.runAllTimersAsync();
    expect(api.create).toHaveBeenCalledWith({ id: "a", name: "Aria" });
    expect(server().get("a")).toEqual(v("a", "Aria la Rossa", 2));
  });

  it("applies remote creations, updates and deletions", () => {
    const { sync, onChange } = setup([v("a", "Aria")]);
    sync.receive({ id: "b", rev: 1, data: { id: "b", name: "Borin" } });
    sync.receive({ id: "a", rev: 2, data: { id: "a", name: "Aria 2" } });
    expect(sync.list).toEqual([
      { id: "a", name: "Aria 2" },
      { id: "b", name: "Borin" },
    ]);
    sync.receive({ id: "a", rev: 3, data: null });
    expect(sync.list).toEqual([{ id: "b", name: "Borin" }]);
    expect(onChange).toHaveBeenLastCalledWith([{ id: "b", name: "Borin" }]);
  });

  it("removes locally and on the server", async () => {
    const { sync, server } = setup([v("a", "Aria")]);
    await sync.remove("a");
    expect(sync.list).toEqual([]);
    expect(server().has("a")).toBe(false);
  });

  it("resync picks up changes missed while disconnected", async () => {
    const { sync, setServer } = setup([v("a", "Aria"), v("b", "Borin")]);
    setServer(new Map([["a", v("a", "Aria (aggiornata)", 4)], ["c", v("c", "Cael")]]));
    await sync.resync();
    expect(sync.list).toEqual([
      { id: "a", name: "Aria (aggiornata)" },
      { id: "c", name: "Cael" },
    ]);
  });

  it("drops a document deleted elsewhere when saving it", async () => {
    const { sync, setServer } = setup([v("a", "Aria")]);
    setServer(new Map());
    sync.update("a", (d) => ({ ...d, name: "x" }));
    await vi.runAllTimersAsync();
    expect(sync.list).toEqual([]);
  });
});
