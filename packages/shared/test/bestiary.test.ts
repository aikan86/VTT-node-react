import { describe, expect, it } from "vitest";
import { currentHandout, groupSummary, monsterTemplate, normalizeMonster, parseMonsterFile, PRESET_MONSTERS, srdIndexFor, srdSlug, statsFromTemplate } from "../src/bestiary";
import { StateExportSchema } from "../src/schemas/export";
import { HandoutSchema, MonsterStatsSchema, newHandout, NpcGroupSchema, type Handout } from "../src/schemas/library";

describe("preset monsters", () => {
  it("are all valid, with unique names", () => {
    for (const m of PRESET_MONSTERS) expect(MonsterStatsSchema.safeParse(m).success, m.name).toBe(true);
    expect(new Set(PRESET_MONSTERS.map((m) => m.name)).size).toBe(PRESET_MONSTERS.length);
    expect(PRESET_MONSTERS.length).toBeGreaterThanOrEqual(20);
  });

  it("become NPC templates with full hit points, and back", () => {
    const goblin = PRESET_MONSTERS.find((m) => m.name === "Goblin")!;
    const t = monsterTemplate(goblin);
    expect(t).toEqual({ name: "Goblin", color: goblin.color, hp: { current: 7, max: 7, temp: 0 }, ac: 15, initiativeMod: 2, size: 1 });
    expect(statsFromTemplate(t)).toEqual({ name: "Goblin", hp: 7, ac: 15, initiativeMod: 2, size: 1, color: goblin.color });
  });
});

describe("illustrations from the online SRD", () => {
  it("every preset knows its English SRD name", () => {
    for (const m of PRESET_MONSTERS) expect(m.srd, m.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(PRESET_MONSTERS.find((m) => m.name === "Gufo-orso")?.srd).toBe("owlbear");
  });

  it("finds the SRD name of numbered NPCs, presets and English names", () => {
    expect(srdIndexFor({ name: "Goblin 3" })).toBe("goblin");
    expect(srdIndexFor({ name: "Ragno gigante 2" })).toBe("giant-spider");
    expect(srdIndexFor({ name: "Giant Spider" })).toBe("giant-spider");
    expect(srdIndexFor({ name: "Sgherro", srd: "thug" })).toBe("thug");
    expect(srdSlug("Élfo  oscuro!")).toBe("elfo-oscuro");
    expect(srdSlug("!!!")).toBeNull();
  });

  it("keeps the image on templates and bestiary entries", () => {
    const orc = { ...PRESET_MONSTERS.find((m) => m.name === "Orco")!, imageUrl: "/uploads/srd-orc.png" };
    const t = monsterTemplate(orc);
    expect(t.imageUrl).toBe("/uploads/srd-orc.png");
    expect(statsFromTemplate(t).imageUrl).toBe("/uploads/srd-orc.png");
    expect(monsterTemplate({ ...orc, imageUrl: undefined })).not.toHaveProperty("imageUrl");
  });

  it("only accepts images stored in the VTT, never external addresses", () => {
    const base = { name: "X", hp: 5, ac: 10, initiativeMod: 0, size: 1, color: "#000000" };
    expect(MonsterStatsSchema.safeParse({ ...base, imageUrl: "/uploads/srd-orc.png" }).success).toBe(true);
    expect(MonsterStatsSchema.safeParse({ ...base, imageUrl: "https://example.com/orc.png" }).success).toBe(false);
    expect(MonsterStatsSchema.safeParse({ ...base, imageUrl: "/uploads/../secret.png" }).success).toBe(false);
  });

  it("reads the SRD name from imported 5e files", () => {
    expect(normalizeMonster({ index: "giant-spider", name: "Giant Spider", hit_points: 26, armor_class: 14 })?.srd).toBe("giant-spider");
    expect(normalizeMonster({ name: "Senza", hp: 5, ac: 10 })).not.toHaveProperty("srd");
  });
});

describe("normalizeMonster", () => {
  it("accepts the app format", () => {
    expect(normalizeMonster({ name: "Orco", hp: 15, ac: 13, initiativeMod: 1, size: 1, color: "#15803d", cr: "1/2" })).toEqual({
      name: "Orco",
      hp: 15,
      ac: 13,
      initiativeMod: 1,
      size: 1,
      color: "#15803d",
      cr: "1/2",
    });
  });

  it("reads common 5e files: hit points, armor class list, dexterity, size names, fractional challenge", () => {
    const m = normalizeMonster({ name: "Owlbear", hit_points: 59, armor_class: [{ type: "natural", value: 13 }], dexterity: 12, size: "Large", challenge_rating: 0.25 });
    expect(m).toEqual({ name: "Owlbear", hp: 59, ac: 13, initiativeMod: 1, size: 2, color: "#dc2626", cr: "1/4" });
  });

  it("reads text values and Italian keys", () => {
    expect(normalizeMonster({ nome: "Lupo", pf: "11 (2d8+2)", ca: "13 (armatura naturale)", destrezza: 15, taglia: "Media" })).toMatchObject({
      name: "Lupo",
      hp: 11,
      ac: 13,
      initiativeMod: 2,
      size: 1,
    });
  });

  it("defaults the initiative to +0 and the size to medium", () => {
    expect(normalizeMonster({ name: "Statua", hp: 30, ac: 17 })).toMatchObject({ initiativeMod: 0, size: 1 });
  });

  it("rejects incomplete or invalid entries", () => {
    expect(normalizeMonster({ name: "Senza PF", ac: 12 })).toBeNull();
    expect(normalizeMonster({ hp: 5, ac: 12 })).toBeNull();
    expect(normalizeMonster({ name: "X", hp: 0, ac: 12 })).toBeNull();
    expect(normalizeMonster({ name: "X", hp: 5, ac: 12, color: "rosso" })).toBeNull();
    expect(normalizeMonster("goblin")).toBeNull();
    expect(normalizeMonster([1, 2])).toBeNull();
  });
});

describe("parseMonsterFile", () => {
  const goblin = { name: "Goblin", hp: 7, ac: 15 };

  it("reads an array and counts skipped entries", () => {
    const r = parseMonsterFile(JSON.stringify([goblin, { name: "Rotto" }, { ...goblin, name: "Hob", hp: 11 }]));
    expect(r.monsters.map((m) => m.name)).toEqual(["Goblin", "Hob"]);
    expect(r.skipped).toBe(1);
  });

  it("reads an object with a list, or a single monster", () => {
    expect(parseMonsterFile(JSON.stringify({ monsters: [goblin] })).monsters).toHaveLength(1);
    expect(parseMonsterFile(JSON.stringify({ mostri: [goblin, goblin] })).monsters).toHaveLength(2);
    expect(parseMonsterFile(JSON.stringify({ results: [goblin] })).monsters).toHaveLength(1);
    expect(parseMonsterFile(JSON.stringify(goblin)).monsters[0]!.name).toBe("Goblin");
  });

  it("fails clearly on broken files", () => {
    expect(() => parseMonsterFile("{ non json")).toThrow(/JSON valido/);
    expect(() => parseMonsterFile("[]")).toThrow(/Nessun mostro valido/);
    expect(() => parseMonsterFile(JSON.stringify([{ name: "x" }]))).toThrow(/nome, PF e CA/);
  });
});

describe("NPC groups", () => {
  const goblin = { name: "Goblin", hp: 7, ac: 15, initiativeMod: 2, size: 1, color: "#dc2626" };

  it("summarises the members", () => {
    expect(groupSummary({ members: [{ monster: goblin, quantity: 4 }, { monster: { ...goblin, name: "Capo" }, quantity: 1 }] })).toBe("4 Goblin, 1 Capo");
  });

  it("need a name and at least one member", () => {
    expect(NpcGroupSchema.safeParse({ id: "g", name: "Banda", members: [{ monster: goblin, quantity: 4 }] }).success).toBe(true);
    expect(NpcGroupSchema.safeParse({ id: "g", name: "Banda", members: [] }).success).toBe(false);
    expect(NpcGroupSchema.safeParse({ id: "g", name: " ", members: [{ monster: goblin, quantity: 4 }] }).success).toBe(false);
    expect(NpcGroupSchema.safeParse({ id: "g", name: "Banda", members: [{ monster: goblin, quantity: 0 }] }).success).toBe(false);
  });
});

describe("handouts", () => {
  const h = (id: string, shownAt: string | null): Handout => ({ ...newHandout(id, `/uploads/${id}.png`), id, shownAt });

  it("are created hidden, with a trimmed title", () => {
    const handout = newHandout("  Lettera  ", "/uploads/a.png", new Date("2026-01-02T03:04:05Z"));
    expect(handout).toMatchObject({ title: "Lettera", imageUrl: "/uploads/a.png", shownAt: null, createdAt: "2026-01-02T03:04:05.000Z" });
    expect(HandoutSchema.safeParse(handout).success).toBe(true);
  });

  it("the most recently shown one is on screen", () => {
    expect(currentHandout([])).toBeUndefined();
    expect(currentHandout([h("a", null)])).toBeUndefined();
    expect(currentHandout([h("a", "2026-01-01T10:00:00.000Z"), h("b", "2026-01-01T11:00:00.000Z"), h("c", null)])?.id).toBe("b");
  });
});

describe("export file", () => {
  it("still accepts saves made before handouts, bestiary and groups", () => {
    const old = { format: "vtt-export", version: 1, exportedAt: "2026-01-01T00:00:00.000Z", characters: [], scenes: [], dmRolls: [], combat: null, uploads: {} };
    const parsed = StateExportSchema.parse(old);
    expect(parsed.handouts).toBeUndefined();
    expect(parsed.monsters).toBeUndefined();
  });
});
