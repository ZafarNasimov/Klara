import { beforeEach, describe, expect, it, vi } from "vitest";

// Live mode, but the model is unreachable.
vi.mock("@/lib/runtime", async (orig) => ({ ...(await orig<typeof import("@/lib/runtime")>()), llmMode: () => "live" }));
vi.mock("./extract", () => ({ extractWithLlm: vi.fn(async () => Promise.reject(new Error("fetch failed"))) }));

const { store } = await import("@/lib/db");
const { listCases } = await import("@/lib/db/repo");
const { buildSeed, IDS } = await import("@/lib/db/seed");
const { berlinTime } = await import("@/lib/deadlines");
const { processMeeting } = await import("./pipeline");
const { createMeeting, getMeeting, patchMeeting } = await import("./repo");
const { SAMPLE_PARTICIPANTS, SAMPLE_RESULT, SAMPLE_SEGMENTS } = await import("./sample");

const at = berlinTime("2026-11-20", 9, 30);

beforeEach(async () => {
  await store().reset(buildSeed(at));
});

async function run(sample: boolean) {
  const m = await createMeeting(
    { projectId: IDS.project, title: "Baubesprechung KW 47", type: "bauherr", teamId: null, participants: SAMPLE_PARTICIPANTS, consent: true, source: sample ? "sample" : "recording" },
    at,
  );
  await patchMeeting(m.id, {}, { transcript: SAMPLE_SEGMENTS });
  await processMeeting(m.id, at, { sample });
  return getMeeting(m.id);
}

describe("LLM unreachable", () => {
  it("the sample loads the stored result, says so, and still applies it for real", async () => {
    const m = await run(true);
    expect(m.status).toBe("ready");
    expect(m.notice).toMatch(/nicht erreichbar: gespeichertes Ergebnis/);
    expect(m.summary).toEqual(SAMPLE_RESULT.summary);
    expect(m.items).toHaveLength(SAMPLE_RESULT.items.length);
    const types = (await listCases(IDS.project)).map((c) => c.doc_type).sort();
    expect(types).toEqual(["anordnung_bestaetigung", "behinderungsanzeige", "mehrkostenanzeige"]);
  });

  it("a real recording falls back to the rules, with its own notice", async () => {
    const m = await run(false);
    expect(m.status).toBe("ready");
    expect(m.notice).toMatch(/nach festen Regeln/);
    expect(m.items.every((i) => i.quote.length > 0)).toBe(true);
  });
});
