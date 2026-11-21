import { describe, expect, it } from "vitest";
import { findQuote, normalizeArea, resolveDay, ruleExtract, verifyItems } from "./items";
import { finalizeSegment, untranslated } from "./language";
import type { Segment } from "./model";
import { SAMPLE_RECORDING, SAMPLE_RESULT, SAMPLE_SEGMENTS } from "./sample";

let n = 0;
const ctx = { meetingId: "m1", baseDay: "2026-11-19", newId: () => `i${++n}` }; // a Thursday

describe("meeting items", () => {
  it("keeps only items whose quote is in the transcript", () => {
    const items = verifyItems(
      [
        { kind: "task", text: "Plan liefern", quote_de: "Plan-Revision C für Trockenbau kommt Montag.", segment: 10 },
        { kind: "mangel", text: "Riss im Estrich", quote_de: "Im Estrich ist ein Riss.", segment: 3 },
        { kind: "decision", text: "ohne Zitat", quote_de: "", segment: 0 },
      ],
      SAMPLE_SEGMENTS,
      ctx,
    );
    expect(items.map((i) => i.kind)).toEqual(["task"]);
    expect(items[0].speaker).toBe("Thomas Weber");
    expect(items[0].quote_language).toBe("de");
    expect(items[0].ts_sec).toBe(246);
  });

  it("finds a quote in another segment when the hint is wrong, ignoring quotes and punctuation", () => {
    expect(findQuote("„Das 2. OG schaffen wir erst Freitag“", SAMPLE_SEGMENTS, 5)).toBe(3);
  });

  it("keeps the German quote and the words as said, with their language", () => {
    const [withModelQuote, wholeSegment] = verifyItems(
      [
        { kind: "behinderung", text: "Elektro 2. OG erst Freitag", quote_de: "Das 2. OG schaffen wir erst Freitag.", quote_original: "Drugie piętro skończymy dopiero w piątek.", segment: 3 },
        { kind: "task", text: "Revision C", quote_de: "Ohne Revision C können wir im 3. OG nicht anfangen.", quote_original: "frei erfunden", segment: 9 },
      ],
      SAMPLE_SEGMENTS,
      ctx,
    );
    expect(withModelQuote).toMatchObject({ quote_de: "Das 2. OG schaffen wir erst Freitag.", quote_original: "Drugie piętro skończymy dopiero w piątek.", quote_language: "pl" });
    // Not verbatim in the original → the whole original segment, never an invented quote.
    expect(wholeSegment).toMatchObject({ quote_original: "Bez revizije C ne možemo da počnemo na trećem spratu.", quote_language: "sr" });
  });

  it("an 'unsicher' segment is never the only evidence for a template", () => {
    const unsure = SAMPLE_SEGMENTS.map((s, i) => (i === 3 ? { ...s, confidence: 0.4 } : s));
    const raw = { kind: "behinderung" as const, text: "Elektro erst Freitag", quote_de: "Das 2. OG schaffen wir erst Freitag.", segment: 3 };
    expect(verifyItems([raw], unsure, ctx)[0].uncertain).toBe(true);
    // Another, sure segment says the same (the Polier: "Das 2. OG ist immer noch nicht frei") → usable.
    expect(verifyItems([{ ...raw, support: [1] }], unsure, ctx)[0].uncertain).toBeUndefined();
    // Tasks and decisions are not templates: kept as they are.
    expect(verifyItems([{ ...raw, kind: "task" }], unsure, ctx)[0].uncertain).toBeUndefined();
  });

  it("links a task to the statement that waits for it", () => {
    const [task] = verifyItems([SAMPLE_RESULT.items.find((i) => i.text.includes("Revision C"))!], SAMPLE_SEGMENTS, ctx);
    expect(task.depends).toMatchObject({ text_de: "Ohne Revision C können wir im 3. OG nicht anfangen.", language: "sr", speaker: "Dragan Petrović" });
    expect(task.owner).toMatch(/Weber/);
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

describe("translation step (checks on the model's output)", () => {
  const src = (text: string): Segment => ({ speaker: "S", start_sec: 0, end_sec: 1, language: null, text_original: text, text_de: null, confidence: null, notes: [] });

  it("the sample: languages per segment, German text, the RU floor conversion noted", () => {
    expect(SAMPLE_SEGMENTS.map((s) => s.language)).toEqual(["de", "ru", "de", "pl", "de", "de", "de", "de", "de", "sr", "de", "de", "de", "pl", "de", "de", "de"]);
    expect(SAMPLE_SEGMENTS[1].text_de).toBe("Das 2. OG ist immer noch nicht frei, wir stehen seit heute Morgen.");
    expect(SAMPLE_SEGMENTS[1].notes).toEqual(["Etagenangabe umgerechnet: RU „Третий этаж“ → 2. OG"]);
    expect(SAMPLE_SEGMENTS[3].notes).toEqual([]); // Polish counts like German
    expect(SAMPLE_SEGMENTS[9].text_de).toMatch(/3\. OG/); // Serbian "treći sprat" = 3. OG
  });

  it("German stays verbatim, whatever the model returns", () => {
    const s = finalizeSegment(src("Das 2. OG schaffen wir erst Freitag."), { language: "de", text_de: "Wir schaffen das 2. OG erst am Freitag.", confidence: 0.9 });
    expect(s.text_de).toBe("Das 2. OG schaffen wir erst Freitag.");
  });

  it("a floor translated with the wrong counting is corrected and noted", () => {
    const s = finalizeSegment(src("Третий этаж до сих пор не освобождён."), { language: "ru", text_de: "Das 3. OG ist immer noch nicht frei.", confidence: 0.9 });
    expect(s.text_de).toBe("Das 2. OG ist immer noch nicht frei.");
    expect(s.notes).toContain("Etagenangabe in der Übersetzung korrigiert: 3. OG → 2. OG");
    expect(s.confidence).toBe(0.9);
  });

  it("an ambiguous English 'first floor' is unsicher and flagged", () => {
    const s = finalizeSegment(src("The first floor is still blocked."), { language: "en", text_de: "Das EG/1. OG? ist noch gesperrt.", confidence: 0.9 });
    expect(s.confidence).toBeLessThan(0.6);
    expect(s.notes.join(" ")).toMatch(/mehrdeutig/);
  });

  it("low confidence keeps the model's reason; a missing translation is unsicher", () => {
    const s = finalizeSegment(src("Drugie ... piętro"), { language: "pl", text_de: "Das 2. OG …", confidence: 0.4, issue: "Satz unvollständig erkannt" });
    expect(s.notes).toContain("Unsicher: Satz unvollständig erkannt");
    expect(finalizeSegment(src("Drugie piętro skończymy dopiero w piątek."), undefined).confidence).toBeLessThan(0.6);
  });

  it("without a model: German passes, other languages stay original and unsicher", () => {
    expect(untranslated(src("Das 2. OG ist frei.")).text_de).toBe("Das 2. OG ist frei.");
    const ru = untranslated(SAMPLE_RECORDING[1]);
    expect(ru.language).toBe("ru");
    expect(ru.confidence).toBeLessThan(0.6);
    expect(ru.notes).toContain("Nicht übersetzt");
  });
});
