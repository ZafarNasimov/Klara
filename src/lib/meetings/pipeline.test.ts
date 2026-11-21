import { beforeEach, describe, expect, it } from "vitest";
import { runTurn } from "@/lib/agent/turn";
import { store } from "@/lib/db";
import { createConversation, listCases, listEvents, listEvidence } from "@/lib/db/repo";
import { buildSeed, IDS } from "@/lib/db/seed";
import { berlinTime } from "@/lib/deadlines";
import { processMeeting } from "./pipeline";
import { createMeeting, getMeeting, patchMeeting } from "./repo";
import { SAMPLE_PARTICIPANTS, SAMPLE_RECORDING, SAMPLE_SEGMENTS } from "./sample";
import type { Segment } from "./model";

const DAY = "2026-11-20"; // a Friday: "erst Freitag" = 2026-11-27
let clock = berlinTime(DAY, 9, 30);
const tick = () => (clock = new Date(clock.getTime() + 60_000));

async function goldenPathCall() {
  const conv = await createConversation({ team_id: IDS.teamEstrich, user_id: IDS.userPolierEstrich, kind: "chat" }, clock);
  const say = (text: string) => runTurn({ conversationId: conv.id, text, now: tick() });
  await say("The electricians haven't cleared the second floor. Our screed crew has been standing since seven, four people waiting.");
  await say("About two days.");
  await say("Yes.");
}

async function runSample(transcript: Segment[] = SAMPLE_RECORDING) {
  const m = await createMeeting(
    { projectId: IDS.project, title: "Baubesprechung KW 47", type: "bauherr", teamId: null, participants: SAMPLE_PARTICIPANTS, consent: true, source: "sample" },
    tick(),
  );
  await patchMeeting(m.id, { duration_sec: 482 }, { transcript });
  await processMeeting(m.id, tick(), { sample: true });
  return getMeeting(m.id);
}

beforeEach(async () => {
  clock = berlinTime(DAY, 9, 30);
  await store().reset(buildSeed(clock));
});

describe("meeting pipeline (rule extraction, memory store)", () => {
  it("updates the open hindrance, drafts only evidenced letters, moves the schedule", async () => {
    await goldenPathCall();
    const before = await listCases(IDS.project);
    const hindrance = before.find((c) => c.doc_type === "behinderungsanzeige" && c.status !== "entwurf")!;
    expect(hindrance).toBeTruthy();

    const m = await runSample();
    expect(m.status).toBe("ready");
    expect(m.notice).toMatch(/gespeicherte Übersetzung/);
    expect(m.languages).toEqual(["de", "pl", "ru", "sr"]);
    expect(m.steps.translation).toBe(true);
    // Every item quotes the German transcript, and the words as said.
    const german = m.transcript.map((s) => s.text_de).join(" ");
    const said = m.transcript.map((s) => s.text_original).join(" ");
    for (const i of m.items) {
      expect(german).toContain(i.quote_de.replace(/[.]$/, ""));
      expect(said).toContain(i.quote_original.replace(/[.]$/, ""));
    }
    expect(m.items.find((i) => i.kind === "behinderung")).toMatchObject({ quote_language: "pl", quote_original: "Drugie piętro skończymy dopiero w piątek." });

    const after = await listCases(IDS.project);
    const byType = (t: string) => after.filter((c) => c.doc_type === t);
    expect(byType("behinderungsanzeige").filter((c) => c.status !== "entwurf")).toHaveLength(1); // updated, not duplicated
    expect(String(after.find((c) => c.id === hindrance.id)!.facts.expected_duration)).toMatch(/Freitag, 27\.11\.2026/);
    expect(byType("anordnung_bestaetigung")).toHaveLength(1);
    expect(byType("mehrkostenanzeige")).toHaveLength(1);
    expect(byType("maengelanzeige")).toHaveLength(0); // "keine Mängel bisher"
    expect(byType("bedenken")).toHaveLength(0);

    const elektro = await store().get("schedule_item", IDS.schedElektro2);
    expect(elektro!.end_date).toBe("2026-11-27");
    expect(m.changes.map((c) => c.text_de)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(new RegExp(`^${hindrance.reference} aktualisiert: voraussichtliches Ende Freitag`)),
        expect.stringMatching(/^Neuer Entwurf KL-2026-\d{4}: Bestätigung mündlicher Anordnung$/),
        expect.stringMatching(/^Neuer Entwurf KL-2026-\d{4}: Mehrkostenanzeige$/),
        expect.stringMatching(/^Termin Elektro 2\. OG: \+\d+ Arbeitstage?$/),
        expect.stringMatching(/^Termin Estrich 2\. OG: \+\d+ Arbeitstage?$/),
        expect.stringMatching(/Aufgaben angelegt$/),
      ]),
    );

    const evidence = await listEvidence(hindrance.id);
    expect(evidence.some((e) => e.kind === "meeting" && e.data.quote === "Das 2. OG schaffen wir erst Freitag.")).toBe(true);
    const events = await listEvents({ projectId: IDS.project });
    expect(events.filter((e) => String(e.payload.source ?? "") === `meeting:${m.ref}`).length).toBeGreaterThanOrEqual(4);
  });

  it("an 'unsicher' segment alone fills no template", async () => {
    const unsure = SAMPLE_SEGMENTS.map((s, i) => (i === 3 ? { ...s, confidence: 0.4 } : s));
    const m = await runSample(unsure);
    const cases = await listCases(IDS.project);
    expect(cases.filter((c) => c.doc_type === "behinderungsanzeige")).toHaveLength(0);
    expect(m.items.filter((i) => i.kind === "behinderung").every((i) => i.case_action === "uncertain")).toBe(true);
    expect(cases.filter((c) => c.doc_type === "anordnung_bestaetigung")).toHaveLength(1); // sure German segment
  });

  it("without an open case it drafts a Behinderungsanzeige, and a second run never duplicates", async () => {
    await runSample();
    const first = await listCases(IDS.project);
    expect(first.filter((c) => c.doc_type === "behinderungsanzeige")).toHaveLength(1);
    const again = await runSample();
    const second = await listCases(IDS.project);
    expect(second).toHaveLength(first.length);
    expect(again.changes.some((c) => /bereits vorhanden|aktualisiert/.test(c.text_de))).toBe(true);
  });
});
