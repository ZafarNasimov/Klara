// "Foto" (SPEC §8): which case a photo belongs to, Klara's confirmation, the
// Bautagesbericht count and the thumbnails on the internal PDF page.
import { beforeEach, describe, expect, it } from "vitest";
import { runTurn } from "@/lib/agent/turn";
import { store } from "@/lib/db";
import { createConversation, listCases, listDocumentVersions, listEvents, listEvidence } from "@/lib/db/repo";
import { buildSeed, IDS } from "@/lib/db/seed";
import { berlinTime } from "@/lib/deadlines";
import { auditInfo } from "@/lib/documents/generate";
import { renderPdf } from "@/lib/documents/pdf";
import { readFile } from "@/lib/files";
import { attachPhoto } from "./photos";

const DAY = "2026-11-20";
let clock = berlinTime(DAY, 9, 30);
const tick = () => (clock = new Date(clock.getTime() + 60_000));
// A valid 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

beforeEach(async () => {
  clock = berlinTime(DAY, 9, 30);
  await store().reset(buildSeed(clock));
});

const photo = (extra: Partial<Parameters<typeof attachPhoto>[0]> = {}) =>
  attachPhoto({ teamId: IDS.teamEstrich, bytes: PNG, contentType: "image/png", ...extra }, tick());

describe("photo from the site", () => {
  it("goes to the case being talked about, with Klara's confirmation", async () => {
    const conv = await createConversation({ team_id: IDS.teamEstrich, user_id: IDS.userPolierEstrich, kind: "chat" }, clock);
    await runTurn({ conversationId: conv.id, text: "Die Elektriker haben das 2.OG nicht freigegeben, 4 Leute stehen seit 7 Uhr.", now: tick() });
    const [draft] = await listCases(IDS.project);

    const r = await photo({ conversationId: conv.id });
    expect(r.case.id).toBe(draft.id);
    expect(r.klara_turn).toMatchObject({ role: "klara", text_original: `Foto abgelegt bei ${draft.reference}.` });
    expect(r.evidence).toMatchObject({ kind: "photo", case_id: draft.id, data: { content_type: "image/png", by: "Sergej Iwanow" } });
    expect(await readFile(r.evidence.ref!)).toEqual(PNG);
    expect((await listEvents({ caseId: draft.id })).map((e) => e.kind)).toContain("photo_added");
  });

  it("without a conversation: the team's newest case of the day, else the day's Bautagesbericht", async () => {
    const report = await photo();
    expect(report.case.doc_type).toBe("bautagesbericht");
    // The report counts the photo.
    const compiled = (await store().get("case", report.case.id))!;
    expect(compiled.facts._photos).toBe(1);
    const [v] = await listDocumentVersions(report.case.id);
    expect(JSON.stringify(v.body)).toContain("1 Foto von der Baustelle");

    const conv = await createConversation({ team_id: IDS.teamEstrich, user_id: IDS.userPolierEstrich, kind: "chat" }, clock);
    await runTurn({ conversationId: conv.id, text: "Die Elektriker haben das 2.OG nicht freigegeben, 4 Leute stehen seit 7 Uhr.", now: tick() });
    const hindrance = (await listCases(IDS.project)).find((c) => c.doc_type === "behinderungsanzeige")!;
    expect((await photo()).case.id).toBe(hindrance.id);
  });

  it("puts the photos on the internal PDF page", async () => {
    const conv = await createConversation({ team_id: IDS.teamEstrich, user_id: IDS.userPolierEstrich, kind: "chat" }, clock);
    const say = (text: string) => runTurn({ conversationId: conv.id, text, now: tick() });
    await say("Die Elektriker haben das 2.OG nicht freigegeben, 4 Leute stehen seit 7 Uhr.");
    await photo({ conversationId: conv.id });
    await say("Etwa zwei Tage.");
    await say("Ja.");
    const c = (await listCases(IDS.project)).find((x) => x.doc_type === "behinderungsanzeige")!;
    expect((await listEvidence(c.id)).filter((e) => e.kind === "photo")).toHaveLength(1);
    const [v] = await listDocumentVersions(c.id);
    const { body, audit } = await auditInfo(v);
    expect(audit.photos).toHaveLength(1);
    expect(audit.photos![0]).toMatchObject({ format: "png", by: "Sergej Iwanow" });
    const pdf = await renderPdf(body, audit);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("refuses files that are not photos, and oversized ones", async () => {
    await expect(photo({ contentType: "application/pdf" })).rejects.toThrow(/Nur Fotos/);
    await expect(photo({ bytes: Buffer.alloc(4_100_000) })).rejects.toThrow(/zu groß/);
  });
});
