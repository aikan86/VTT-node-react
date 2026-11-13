import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocSync, type SaveResult } from "./docSync";

interface Doc {
  count: number;
  tags: string[];
}

const doc = (count = 0, tags: string[] = []): Doc => ({ count, tags });
const inc = (d: Doc): Doc => ({ ...d, count: d.count + 1 });
const tag = (t: string) => (d: Doc): Doc => ({ ...d, tags: [...d.tags, t] });

/** Server finto: tiene versione e documento, applica le regole di If-Match. */
function fakeServer(initial: Doc, rev = 1) {
  const server = { rev, data: initial, saves: [] as { doc: Doc; rev: number }[] };
  const save = vi.fn(async (d: Doc, baseRev: number): Promise<SaveResult<Doc>> => {
    server.saves.push({ doc: d, rev: baseRev });
    if (baseRev !== server.rev) return { status: "conflict", current: { rev: server.rev, data: server.data } };
    server.rev += 1;
    server.data = d;
    return { status: "ok", rev: server.rev };
  });
  /** Modifica fatta da un altro tab. */
  const remoteWrite = (fn: (d: Doc) => Doc) => {
    server.data = fn(server.data);
    server.rev += 1;
    return { rev: server.rev, data: server.data };
  };
  return { server, save, remoteWrite };
}

function setup(initial = doc(), opts: Partial<ConstructorParameters<typeof DocSync<Doc>>[1]> = {}) {
  const { server, save, remoteWrite } = fakeServer(initial);
  const onChange = vi.fn();
  const sync = new DocSync<Doc>({ rev: 1, data: initial }, { save, onChange, delayMs: 100, ...opts });
  return { sync, server, save, remoteWrite, onChange };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("DocSync", () => {
  it("applies ops immediately and saves them together after the delay", async () => {
    const { sync, server, save, onChange } = setup();
    sync.apply(inc);
    sync.apply(tag("a"));
    expect(sync.value).toEqual(doc(1, ["a"]));
    expect(onChange).toHaveBeenLastCalledWith(doc(1, ["a"]));
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(server.saves[0]).toEqual({ doc: doc(1, ["a"]), rev: 1 });
    expect(sync.version).toBe(2);
    expect(sync.hasPending).toBe(false);
  });

  it("ignores ops that do not change the document", async () => {
    const { sync, save } = setup();
    sync.apply((d) => d);
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
  });

  it("on conflict rebases its own ops on the newer version instead of overwriting it", async () => {
    const { sync, server, remoteWrite } = setup();
    remoteWrite(tag("dall'altro tab")); // l'altro tab ha salvato, questo non lo sa ancora
    sync.apply(inc);
    await vi.runAllTimersAsync();

    expect(server.data).toEqual(doc(1, ["dall'altro tab"]));
    expect(sync.value).toEqual(doc(1, ["dall'altro tab"]));
    expect(sync.version).toBe(server.rev);
  });

  it("applies remote changes and replays pending local ops on top", async () => {
    const { sync, remoteWrite, onChange } = setup();
    sync.apply(inc);
    sync.receive(remoteWrite(tag("remoto")));
    expect(sync.value).toEqual(doc(1, ["remoto"]));
    expect(onChange).toHaveBeenLastCalledWith(doc(1, ["remoto"]));

    await vi.advanceTimersByTimeAsync(100);
    expect(sync.value).toEqual(doc(1, ["remoto"]));
    expect(sync.hasPending).toBe(false);
  });

  it("ignores remote versions that are not newer", () => {
    const { sync } = setup(doc(5));
    sync.receive({ rev: 1, data: doc(0) });
    expect(sync.value).toEqual(doc(5));
  });

  it("buffers remote changes that arrive while a save is in flight (no double apply)", async () => {
    const initial = doc();
    let release!: () => void;
    const { server, save, remoteWrite } = fakeServer(initial);
    const slowSave = vi.fn(async (d: Doc, rev: number) => {
      await new Promise<void>((r) => (release = r));
      return save(d, rev);
    });
    const sync = new DocSync<Doc>({ rev: 1, data: initial }, { save: slowSave, onChange: vi.fn(), delayMs: 100 });

    sync.apply(inc);
    await vi.advanceTimersByTimeAsync(100); // PUT partito, risposta in attesa
    release();
    await Promise.resolve();
    // il server ha accettato (rev 2); un altro tab scrive subito dopo (rev 3, contiene già il nostro +1)
    const theirs = remoteWrite(tag("dopo"));
    sync.receive(theirs);
    await vi.runAllTimersAsync();

    expect(server.data).toEqual(doc(1, ["dopo"]));
    expect(sync.value).toEqual(doc(1, ["dopo"]));
    expect(sync.version).toBe(3);
  });

  it("replays ids and random values identically when rebasing", async () => {
    const { sync, server, remoteWrite } = setup();
    let firstId = "";
    sync.apply((d, ctx) => {
      const id = ctx.id();
      firstId ||= id;
      return { ...d, tags: [...d.tags, id], count: Math.floor(ctx.rng() * 1000) };
    });
    const before = sync.value;
    remoteWrite((d) => d); // forza un conflitto
    await vi.runAllTimersAsync();
    expect(server.data.tags).toEqual([firstId]);
    expect(server.data.count).toBe(before.count);
  });

  it("drops the document when the server says it no longer exists", async () => {
    const onGone = vi.fn();
    const save = vi.fn(async (): Promise<SaveResult<Doc>> => ({ status: "gone" }));
    const sync = new DocSync<Doc>({ rev: 1, data: doc() }, { save, onChange: vi.fn(), onGone, delayMs: 100 });
    sync.apply(inc);
    await vi.advanceTimersByTimeAsync(100);
    expect(onGone).toHaveBeenCalled();
    sync.apply(inc);
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps ops after a network error and retries", async () => {
    const onError = vi.fn();
    const { server, save } = fakeServer(doc());
    save.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const sync = new DocSync<Doc>({ rev: 1, data: doc() }, { save, onChange: vi.fn(), onError, delayMs: 100, retryMs: 1000 });
    sync.apply(inc);
    await vi.advanceTimersByTimeAsync(100);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(sync.hasPending).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(server.data).toEqual(doc(1));
    expect(sync.hasPending).toBe(false);
  });

  it("drops ops rejected permanently by the server and reverts to its version", async () => {
    const onError = vi.fn();
    const rejected = Object.assign(new Error("Dati non validi"), { status: 400 });
    const save = vi.fn(async (): Promise<SaveResult<Doc>> => {
      throw rejected;
    });
    const sync = new DocSync<Doc>(
      { rev: 1, data: doc() },
      { save, onChange: vi.fn(), onError, delayMs: 100, isPermanent: (e) => e === rejected },
    );
    sync.apply(inc);
    await vi.advanceTimersByTimeAsync(100);
    expect(onError).toHaveBeenCalledWith(rejected);
    expect(sync.value).toEqual(doc());
    expect(sync.hasPending).toBe(false);
  });

  it("waits to save while the document is not valid", async () => {
    const { sync, save } = setup(doc(), { canSave: (d) => d.count % 2 === 0 });
    sync.apply(inc); // dispari: non salvabile
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
    sync.apply(inc);
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush sends pending ops immediately", async () => {
    const { sync, save } = setup();
    sync.apply(inc);
    await sync.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("waits for creation before saving updates to a new document", async () => {
    let created!: (rev: number) => void;
    const ready = new Promise<number>((r) => (created = r));
    const { save } = fakeServer(doc());
    const sync = new DocSync<Doc>({ rev: 0, data: doc() }, { save, onChange: vi.fn(), delayMs: 100, ready });
    sync.apply(inc);
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
    created(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledWith(doc(1), 1);
  });
});
