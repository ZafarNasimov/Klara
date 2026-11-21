// M4 e-mail loop (SPEC §6.4, §8, §12): draft → validate → send → reply → follow-up.
// Memory store, keyword reader and keyword classifier, no mail server (simulated send).
import { beforeEach, describe, expect, it } from "vitest";
import { runTurn } from "@/lib/agent/turn";
import { validateCase } from "@/lib/cases/actions";
import { store } from "@/lib/db";
import { createConversation, listCases, listDocumentVersions, listEvents, listEvidence } from "@/lib/db/repo";
import { buildSeed, IDS } from "@/lib/db/seed";
import { berlinTime } from "@/lib/deadlines";
import { generateDocument } from "@/lib/documents/generate";
import type { Case } from "@/lib/types";
import { classifyByKeywords, verbatimQuote } from "./classify";
import { mailSubject } from "./compose";
import { createDraft, draftView, sendDraft, updateDraft } from "./drafts";
import { receiveReply, simulateReply } from "./inbound";

const DAY = "2026-11-20";
let clock = berlinTime(DAY, 9, 30);
const tick = () => (clock = new Date(clock.getTime() + 60_000));

beforeEach(async () => {
  clock = berlinTime(DAY, 9, 30);
  await store().reset(buildSeed(clock));
});

/** SPEC §1 golden path up to a confirmed Behinderungsanzeige (status "bereit"). */
async function readyHindrance(): Promise<Case> {
  const conv = await createConversation({ team_id: IDS.teamEstrich, user_id: IDS.userPolierEstrich, kind: "call" }, clock);
  const say = (text: string) => runTurn({ conversationId: conv.id, text, now: tick() });
  await say("The electricians haven't cleared the second floor. Our screed crew has been standing since seven, four people waiting.");
  await say("About two days.");
  await say("Yes.");
  const [c] = (await listCases(IDS.project)).filter((x) => x.doc_type === "behinderungsanzeige");
  expect(c.status).toBe("bereit");
  return c;
}

async function sentHindrance(): Promise<Case> {
  const c = await readyHindrance();
  await validateCase(c.id, IDS.userBauleiter, tick());
  const draft = await createDraft(c.id, tick());
  await sendDraft(draft.id, { userId: IDS.userBauleiter }, tick());
  return (await store().get("case", c.id))!;
}

describe("subject (SPEC §8)", () => {
  it("names the VOB/B basis for plain bases only", () => {
    expect(mailSubject({ doc_type: "behinderungsanzeige", reference: "KL-2026-0042" }, "Neubau Bürogebäude München")).toBe(
      "Behinderungsanzeige gem. § 6 Abs. 1 VOB/B – BV Neubau Bürogebäude München – Zeichen KL-2026-0042",
    );
    expect(mailSubject({ doc_type: "stellungnahme_zurueckweisung", reference: "KL-2026-0043" }, "Neubau Bürogebäude München")).toBe(
      "Stellungnahme zur Zurückweisung – BV Neubau Bürogebäude München – Zeichen KL-2026-0043",
    );
  });
});

describe("draft and send", () => {
  it("prefills the composer and refuses to send before validation", async () => {
    const c = await readyHindrance();
    const draft = await createDraft(c.id, tick());
    // Architect has no authority: the letter and the e-mail go to the client (Bauherr).
    expect(draft.to).toEqual(["petra.lang@immobilien-isar.example"]);
    expect(draft.subject).toContain("Zeichen KL-2026-0042");
    expect(draft.body).toMatch(/^Sehr geehrte Damen und Herren,/);
    expect(draft.body).toContain("KL-2026-0042");
    // Opening the composer again reuses the draft.
    expect((await createDraft(c.id, tick())).id).toBe(draft.id);

    const view = await draftView(draft.id);
    expect(view.send_blocker).toBe("Senden ist erst möglich, wenn die Bauleitung das Schreiben validiert hat.");
    expect(view.attachments.map((a) => a.name)).toEqual(["KL-2026-0042_v1.pdf", "KL-2026-0042_v1.docx"]);
    expect(view.delivery).toBe("simulated");
    await expect(sendDraft(draft.id, { userId: IDS.userBauleiter }, tick())).rejects.toThrow(/validiert/);
  });

  it("sends the validated version once and makes it immutable", async () => {
    const c = await readyHindrance();
    await validateCase(c.id, IDS.userBauleiter, tick());
    const draft = await createDraft(c.id, tick());
    await updateDraft(draft.id, { body: `${draft.body}\n` });
    await expect(sendDraft(draft.id, { userId: IDS.userPolierEstrich }, tick())).rejects.toThrow(/Büro oder die Bauleitung/);

    const sent = await sendDraft(draft.id, { userId: IDS.userBauleiter, attachDocx: true }, tick());
    expect(sent).toMatchObject({ status: "versendet", message_id: expect.stringMatching(/^sim-/) });
    const [v] = await listDocumentVersions(c.id);
    expect(v).toMatchObject({ immutable: true, delivery_status: "simuliert", sent_at: sent.sent_at });
    const after = (await store().get("case", c.id))!;
    expect(after.status).toBe("versendet");
    expect(after.checks.find((x) => x.id === "channel")).toMatchObject({ light: "yellow", reason_de: "Testversand ohne E-Mail-Server, nicht zugestellt" });
    expect((await listEvents({ caseId: c.id })).map((e) => e.kind)).toContain("email_sent");
    expect((await listEvidence(c.id)).some((e) => e.kind === "email")).toBe(true);

    await expect(sendDraft(draft.id, { userId: IDS.userBauleiter }, tick())).rejects.toThrow(/bereits versendet/);
    await expect(updateDraft(draft.id, { subject: "Neu" })).rejects.toThrow(/bereits versendet/);
    await expect(generateDocument(c.id, tick())).rejects.toThrow(/versendet/);
  });
});

describe("addressee and one-step approval", () => {
  it("does not send unless the letter's addressee is among the recipients", async () => {
    const c = await readyHindrance();
    await validateCase(c.id, IDS.userBauleiter, tick());
    const draft = await createDraft(c.id, tick());
    // Only the architect (no Vollmacht): the letter is addressed to the Bauherr.
    await updateDraft(draft.id, { to: ["t.weber@buero-weber.example"] });
    const view = await draftView(draft.id);
    expect(view.addressee).toMatchObject({ email: "petra.lang@immobilien-isar.example", name: "Dr. Petra Lang" });
    expect(view.send_blocker).toBe("Das Schreiben ist an Dr. Petra Lang, Immobilien Isar GmbH adressiert. Diese Adresse muss unter „An“ stehen.");
    await expect(sendDraft(draft.id, { userId: IDS.userBauleiter }, tick())).rejects.toThrow(/adressiert/);
    expect(view.contacts.find((k) => k.email === "t.weber@buero-weber.example")?.has_authority).toBe(false);
  });

  it("lets the Bauleiter validate and send in one step, not the office", async () => {
    const c = await readyHindrance();
    const draft = await createDraft(c.id, tick());
    const view = await draftView(draft.id);
    expect(view).toMatchObject({ needs_validation: true, validation_blocker: null });
    await expect(sendDraft(draft.id, { userId: IDS.userBuero, validate: true }, tick())).rejects.toThrow(/Bauleitung/);
    const sent = await sendDraft(draft.id, { userId: IDS.userBauleiter, validate: true }, tick());
    expect(sent.status).toBe("versendet");
    const [v] = await listDocumentVersions(c.id);
    expect(v).toMatchObject({ immutable: true, validated_by: IDS.userBauleiter });
    expect((await listEvents({ caseId: c.id })).map((e) => e.kind)).toEqual(expect.arrayContaining(["case_validated", "email_sent"]));
  });
});

describe("scenario 7: rejection → Stellungnahme (SPEC §6.4, §10)", () => {
  it("matches the reply, classifies it and drafts the rebuttal with evidence", async () => {
    const c = await sentHindrance();
    const r = await simulateReply(null, tick());
    expect(r.case?.id).toBe(c.id);
    expect(r.classification.kind).toBe("rejection");
    expect(r.case?.status).toBe("beantwortet");

    const f = r.followup!;
    expect(f).toMatchObject({ doc_type: "stellungnahme_zurueckweisung", parent_case_id: c.id, status: "bereit", team_id: null, reference: "KL-2026-0043" });
    expect(f.facts).toMatchObject({ orig_reference: "KL-2026-0042", reply_date: DAY, reply_quote: "Die Elektroarbeiten liegen im Zeitplan." });
    const bullets = f.facts.evidence_bullets as string[];
    expect(bullets[0]).toBe("Beginn der Behinderung: 20.11.2026, 07:00 Uhr, Bereich 2.OG");
    expect(bullets.some((b) => /^Laut Bauzeitenplan war „Elektroinstallation .*“ im 2\.OG bis \d\d\.\d\d\.2026 abzuschließen$/.test(b))).toBe(true);
    expect(bullets.some((b) => b.startsWith("Meldung durch Sergej Iwanow am 20.11.2026"))).toBe(true);
    const [v1] = await listDocumentVersions(f.id);
    expect(v1.version).toBe(1);

    const kinds = (await listEvents({ caseId: c.id })).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["reply_received", "followup_proposed"]));
    const received = (await listEvents({ caseId: c.id })).find((e) => e.kind === "reply_received")!;
    expect(received.payload.summary_de).toBe("Antwort des Bauherrn: Zurückweisung – „Die Elektroarbeiten liegen im Zeitplan.“");
    // The answer proves the letter arrived.
    expect(r.case?.checks.find((x) => x.id === "channel")).toMatchObject({ light: "green", reason_de: "Zugang belegt: Antwort des Bauherrn vom 20.11.2026" });
  });

  it("ignores a repeated webhook for the same message", async () => {
    const c = await sentHindrance();
    const mail = (await store().list("email_out", { where: { case_id: c.id } }))[0];
    const payload = {
      From: "Dr. Petra Lang <petra.lang@immobilien-isar.example>",
      Subject: `AW: ${mail.subject}`,
      TextBody: "Sehr geehrte Damen und Herren,\n\nwir weisen Ihre Behinderungsanzeige zurück. Die Elektroarbeiten liegen im Zeitplan.",
      MessageID: "pm-inbound-1",
      Headers: [{ Name: "In-Reply-To", Value: `<${mail.message_id}@mtasv.net>` }],
    };
    const first = await receiveReply(payload, tick());
    const again = await receiveReply(payload, tick());
    expect(first.followup).not.toBeNull();
    expect(again.duplicate).toBe(true);
    expect((await listCases(IDS.project)).filter((x) => x.doc_type === "stellungnahme_zurueckweisung")).toHaveLength(1);
  });

  it("falls back to the reference in the subject, and keeps unknown mail unassigned", async () => {
    const c = await sentHindrance();
    const byRef = await receiveReply({ From: "t.weber@buero-weber.example", Subject: "Ihr Zeichen KL-2026-0042", TextBody: "Wir bestätigen den Eingang Ihres Schreibens." }, tick());
    expect(byRef.case?.id).toBe(c.id);
    expect(byRef.classification.kind).toBe("acceptance");
    expect(byRef.case?.status).toBe("abgeschlossen");

    const lost = await receiveReply({ From: "info@example.org", Subject: "Frage", TextBody: "Wann ist die Baustelle fertig?" }, tick());
    expect(lost.case).toBeNull();
    expect(lost.email.case_id).toBeNull();
  });
});

describe("inbound webhook route", () => {
  it("refuses a wrong token with 403 and accepts Postmark JSON with the right one", async () => {
    const { POST } = await import("@/app/api/email/inbound/route");
    process.env.POSTMARK_INBOUND_TOKEN = "s3cret";
    try {
      const body = JSON.stringify({ From: "info@example.org", Subject: "Frage", TextBody: "Wann kommt der Estrich?", MessageID: "pm-route-1" });
      const denied = await POST(new Request("http://x/api/email/inbound?token=nope", { method: "POST", body }));
      expect(denied.status).toBe(403);
      const ok = await POST(new Request("http://x/api/email/inbound?token=s3cret", { method: "POST", body }));
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ ok: true, case_id: null, duplicate: false });
      expect(await store().list("email_in", { where: { message_id: "pm-route-1" } })).toHaveLength(1);
    } finally {
      delete process.env.POSTMARK_INBOUND_TOKEN;
    }
  });
});

describe("keyword classifier", () => {
  it("reads German replies", () => {
    expect(classifyByKeywords("", "Wir weisen Ihre Behinderungsanzeige zurück. Die Elektroarbeiten liegen im Zeitplan.")).toMatchObject({
      kind: "rejection",
      key_points: ["Die Elektroarbeiten liegen im Zeitplan."],
    });
    expect(classifyByKeywords("", "Ihre Mehrkostenanzeige wird nicht anerkannt.").kind).toBe("rejection");
    expect(classifyByKeywords("", "Bitte senden Sie uns die Stundenzettel vom 19.11.").kind).toBe("request_info");
    expect(classifyByKeywords("AW: Behinderungsanzeige", "Wir haben Ihr Schreiben zur Kenntnis genommen.").kind).toBe("acceptance");
    expect(classifyByKeywords("", "Schönes Wochenende!").kind).toBe("other");
  });

  it("quotes only the client's own sentence", () => {
    const text = "Sehr geehrte Damen und Herren,\n\nwir weisen Ihre Behinderungsanzeige zurück. Die Elektroarbeiten liegen im Zeitplan.\n\nMit freundlichen Grüßen";
    expect(verbatimQuote("Die Elektroarbeiten liegen laut Zeitplan im Plan", text)).toBe("Die Elektroarbeiten liegen im Zeitplan.");
    expect(verbatimQuote("Der Bauherr bestreitet jede Verzögerung", text)).toBeNull();
  });
});
