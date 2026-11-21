import { beforeEach, describe, expect, it, vi } from "vitest";

// Live mode, but the model is unreachable.
vi.mock("@/lib/runtime", async (orig) => ({ ...(await orig<typeof import("@/lib/runtime")>()), llmMode: () => "live" }));
vi.mock("./extract", () => ({ extractWithLlm: vi.fn(async () => Promise.reject(new Error("fetch failed"))) }));
vi.mock("./translate", () => ({ translateSegments: vi.fn(async () => Promise.reject(new Error("fetch failed"))) }));

const { store } = await import("@/lib/db");
const { listCases } = await import("@/lib/db/repo");
const { buildSeed, IDS } = await import("@/lib/db/seed");
const { berlinTime } = await import("@/lib/deadlines");
const { processMeeting } = await import("./pipeline");
const { createMeeting, getMeeting, patchMeeting } = await import("./repo");
const { SAMPLE_PARTICIPANTS, SAMPLE_RECORDING, SAMPLE_RESULT } = await import("./sample");

const at = berlinTime("2026-11-20", 9, 30);

beforeEach(async () => {
  await store().reset(buildSeed(at));
});

async function run(sample: boolean) {
  const m = await createMeeting(
    { projectId: IDS.project, title: "Baubesprechung KW 47", type: "bauherr", teamId: null, participants: SAMPLE_PARTICIPANTS, consent: true, source: sample ? "sample" : "recording" },
    at,
  );
  await patchMeeting(m.id, {}, { transcript: SAMPLE_RECORDING });
  await processMeeting(m.id, at, { sample });
  return getMeeting(m.id);
}

describe("LLM unreachable", () => {
  it("the sample loads the stored result, says so, and still applies it for real", async () => {
    const m = await run(true);
    expect(m.status).toBe("ready");
    expect(m.notice).toMatch(/gespeicherte Übersetzung/);
    expect(m.notice).toMatch(/nicht erreichbar: gespeichertes Ergebnis/);
    expect(m.summary).toEqual(SAMPLE_RESULT.summary);
    expect(m.items).toHaveLength(SAMPLE_RESULT.items.length);
    const types = (await listCases(IDS.project)).map((c) => c.doc_type).sort();
    expect(types).toEqual(["anordnung_bestaetigung", "behinderungsanzeige", "mehrkostenanzeige"]);
  });

  it("a real recording: untranslated segments are unsicher, rules on the German ones, with its own notice", async () => {
    const m = await run(false);
    expect(m.status).toBe("ready");
    expect(m.notice).toMatch(/unübersetzt/);
    expect(m.notice).toMatch(/nach festen Regeln/);
    expect(m.transcript[1]).toMatchObject({ language: "ru", text_de: SAMPLE_RECORDING[1].text_original });
    expect(m.transcript[1].confidence).toBeLessThan(0.6);
    expect(m.items.every((i) => i.quote_de.length > 0)).toBe(true);
    // Nothing in Polish was translated, so the Elektro delay is not evidenced: no hindrance letter.
    expect((await listCases(IDS.project)).some((c) => c.doc_type === "behinderungsanzeige")).toBe(false);
  });
});
