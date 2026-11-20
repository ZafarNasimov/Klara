// End-to-end turn tests against the memory store and the mock extractor.
import { beforeEach, describe, expect, it } from "vitest";
import { createConversation, getCase, resetDemo, listCases } from "@/lib/db/repo";
import { IDS } from "@/lib/db/seed";
import { runTurn } from "./turn";

async function call(lang = "en") {
  return createConversation({ team_id: IDS.teamEstrich, user_id: IDS.userPolierEstrich, kind: "call", language: lang });
}

describe("agent turn (mock extractor)", () => {
  beforeEach(async () => {
    await resetDemo();
  });

  it("demo golden path: hindrance → 1 question → readback → confirm", async () => {
    const conv = await call();
    const t1 = await runTurn({
      conversation_id: conv.id,
      text_original:
        "The electricians haven't cleared the second floor. Our screed crew has been standing since seven, four people waiting.",
    });
    expect(t1.cases).toHaveLength(1);
    const c = t1.cases[0];
    expect(c.doc_type).toBe("behinderungsanzeige");
    expect(c.sphere).toBe("client");
    expect(c.facts.area).toBe("2.OG");
    expect(c.facts.idle_staff).toBe(4);
    expect(t1.reply).toBe("How long do you expect this to last?");

    const t2 = await runTurn({ conversation_id: conv.id, text_original: "About two days." });
    expect(t2.reply).toMatch(/^Let me read that back\./);
    expect(t2.reply).toContain("ca. 2 Arbeitstage");
    expect(t2.reply).toMatch(/Is that correct\?$/);

    const t3 = await runTurn({ conversation_id: conv.id, text_original: "Yes." });
    expect(t3.reply).toMatch(/prepared the document/);
    const done = await getCase(c.id);
    expect(done?.status).toBe("bereit");
    expect(done?.checks.find((x) => x.id === "recipient")?.reason_de).toBe("Adressat: Bauherr (Architekt ohne Vollmacht)");
    expect(done?.deadline_rule).toBe("unverzueglich");
  });

  it("scenario 1: Alles nach Plan → diary, no case", async () => {
    const conv = await call("de");
    const t = await runTurn({ conversation_id: conv.id, text_original: "Alles nach Plan heute." });
    expect(t.cases).toHaveLength(0);
    expect(t.reply).toContain("Bautagesbericht");
    expect(await listCases()).toHaveLength(0);
  });

  it("scenario 3: verbal instruction → Anordnungsbestätigung + Mehrkosten, asks 'started?' first", async () => {
    const conv = await call("ru");
    const t = await runTurn({ conversation_id: conv.id, text_original: "Архитектор Вебер устно сказал: 3 дополнительные противопожарные двери." });
    const types = t.cases.map((c) => c.doc_type).sort();
    expect(types).toEqual(["anordnung_bestaetigung", "mehrkostenanzeige"]);
    expect(t.reply).toBe("Вы уже начали эту дополнительную работу?");
    const mk = t.cases.find((c) => c.doc_type === "mehrkostenanzeige")!;
    expect(mk.checks.find((x) => x.id === "recipient")?.light).toBe("yellow");
  });

  it("scenario 4: Trockenbauer nicht gekommen → no Behinderungsanzeige, verzug_nu + risk", async () => {
    const conv = await call("de");
    const t = await runTurn({ conversation_id: conv.id, text_original: "Die Trockenbauer sind heute nicht gekommen, 2.OG." });
    expect(t.cases.map((c) => c.doc_type)).toEqual(["verzug_nu"]);
    expect(t.cases[0].flags).toContain("internal_risk");
    expect(t.reply).toContain("Nachunternehmer");
  });

  it("scenario 5: storm → Behinderungsanzeige without cost reservation", async () => {
    const conv = await call("de");
    const t = await runTurn({ conversation_id: conv.id, text_original: "Sturm, der Kran stand den ganzen Tag seit 7 Uhr." });
    expect(t.cases[0].doc_type).toBe("behinderungsanzeige");
    expect(t.cases[0].sphere).toBe("weather");
    expect(t.cases[0].facts.cost_reservation).toBe(false);
    expect(t.cases[0].checks.find((x) => x.id === "sphere")?.light).toBe("yellow");
  });

  it("scenario 9: vague utterance → clarifying question, no case", async () => {
    const conv = await call("de");
    const t = await runTurn({ conversation_id: conv.id, text_original: "es ist irgendwie blöd heute" });
    expect(t.cases).toHaveLength(0);
    expect(t.reply).toBe("Können Sie mir etwas genauer sagen, was passiert ist, und wo?");
  });

  it("scenario 10: work already started → red light + escalation flag", async () => {
    const conv = await call("de");
    await runTurn({ conversation_id: conv.id, text_original: "Architekt Weber sagte heute mündlich: 3 zusätzliche Brandschutztüren im 2.OG." });
    const t = await runTurn({ conversation_id: conv.id, text_original: "Ja, schon begonnen." });
    const mk = (await listCases()).find((c) => c.doc_type === "mehrkostenanzeige")!;
    expect(mk.facts.work_started).toBe(true);
    expect(mk.checks.find((x) => x.id === "timing_mehrkosten")?.light).toBe("red");
    expect(mk.flags).toContain("escalate");
    expect(t.reply.length).toBeGreaterThan(0);
  });

  it("scenario 8: two events in one utterance → two cases", async () => {
    const conv = await call("de");
    const t = await runTurn({
      conversation_id: conv.id,
      text_original: "Die Elektriker haben das 2.OG nicht freigegeben, 4 Leute warten seit 7 Uhr. Und Architekt Weber sagte mündlich: 2 zusätzliche Brandschutztüren.",
    });
    const types = t.cases.map((c) => c.doc_type);
    expect(types).toContain("behinderungsanzeige");
    expect(types).toContain("mehrkostenanzeige");
  });

  it("end call closes the conversation", async () => {
    const conv = await call();
    const t = await runTurn({ conversation_id: conv.id, text_original: "That's all, bye" });
    expect(t.ended).toBe(true);
    expect(t.conversation.status).toBe("closed");
  });
});
