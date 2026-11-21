import { describe, expect, it } from "vitest";
import { findQuote, normalizeArea, resolveDay, ruleExtract, verifyItems } from "./items";
import { SAMPLE_RESULT, SAMPLE_SEGMENTS } from "./sample";

let n = 0;
const ctx = { meetingId: "m1", baseDay: "2026-11-19", newId: () => `i${++n}` }; // a Thursday

describe("meeting items", () => {
  it("keeps only items whose quote is in the transcript", () => {
    const items = verifyItems(
      [
        { kind: "task", text: "Plan liefern", quote: "Plan-Revision C für Trockenbau kommt Montag.", segment: 7 },
        { kind: "mangel", text: "Riss im Estrich", quote: "Im Estrich ist ein Riss.", segment: 3 },
        { kind: "decision", text: "ohne Zitat", quote: "", segment: 0 },
      ],
      SAMPLE_SEGMENTS,
      ctx,
    );
    expect(items.map((i) => i.kind)).toEqual(["task"]);
    expect(items[0].speaker).toBe("Thomas Weber");
    expect(items[0].ts_sec).toBe(246);
  });

  it("finds a quote in another segment when the hint is wrong, ignoring quotes and punctuation", () => {
    expect(findQuote("„Das 2. OG schaffen wir erst Freitag“", SAMPLE_SEGMENTS, 5)).toBe(1);
  });

  it("resolves spoken days against the meeting day", () => {
    expect(resolveDay("erst Freitag", "2026-11-19")).toBe("2026-11-20");
    expect(resolveDay("Montag", "2026-11-19")).toBe("2026-11-23");
    expect(resolveDay("Donnerstag", "2026-11-19")).toBe("2026-11-26"); // said on a Thursday = next week
    expect(resolveDay("heute", "2026-11-19")).toBe("2026-11-19");
    expect(resolveDay("bis 3.12.", "2026-11-19")).toBe("2026-12-03");
    expect(resolveDay("bald", "2026-11-19")).toBeNull();
  });

  it("normalizes areas", () => {
    expect(normalizeArea("2. OG")).toBe("2.OG");
    expect(normalizeArea("im 3. Obergeschoss")).toBe("3.OG");
  });

  it("the stored sample result passes its own quote check", () => {
    const items = verifyItems(SAMPLE_RESULT.items, SAMPLE_SEGMENTS, ctx);
    expect(items).toHaveLength(SAMPLE_RESULT.items.length);
  });

  it("rule extraction finds the sample's letters and never a negated defect", () => {
    const raw = ruleExtract(SAMPLE_SEGMENTS);
    const kinds = new Set(raw.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(["anordnung", "behinderung", "decision", "mehrkosten", "task", "termin"].sort());
    expect(raw.some((r) => r.kind === "mangel")).toBe(false); // "keine Mängel bisher"
    expect(raw.filter((r) => r.kind === "task").length).toBeGreaterThanOrEqual(3);
    expect(verifyItems(raw, SAMPLE_SEGMENTS, ctx)).toHaveLength(raw.length);
  });
});

describe("seed meetings", async () => {
  const { buildSeedMeetings, SAMPLE_RESULT: R } = await import("./sample");
  const { buildSeed } = await import("@/lib/db/seed");
  const now = new Date("2026-11-20T08:00:00Z");

  it("MT-2026-0006 and MT-2026-0007 keep every stored item (all quotes verbatim)", () => {
    const [kw46, kw47] = buildSeedMeetings(now);
    const p46 = kw46.protocol as { ref: string; items: unknown[] };
    const p47 = kw47.protocol as { ref: string; items: { kind: string }[]; changes: { text_de: string }[] };
    expect([p46.ref, p47.ref]).toEqual(["MT-2026-0006", "MT-2026-0007"]);
    expect(p46.items).toHaveLength(2);
    expect(p47.items).toHaveLength(R.items.length);
    expect(p47.items.some((i) => i.kind === "mangel" || i.kind === "bedenken")).toBe(false);
    expect(p47.changes.map((c) => c.text_de)).toContain("4 Aufgaben angelegt");
  });

  it("buildSeed carries the meetings but no cases", () => {
    const seed = buildSeed(now);
    expect(seed.meeting).toHaveLength(2);
    expect(seed.case).toHaveLength(0);
  });
});
