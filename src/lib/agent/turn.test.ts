// SPEC §10 test scenarios through the whole text pipeline (keyword reader, memory store).
import { beforeEach, describe, expect, it } from "vitest";
import { store } from "@/lib/db";
import { createConversation, getDailyReport, listCases, listEvents } from "@/lib/db/repo";
import { buildSeed, IDS } from "@/lib/db/seed";
import { berlinTime } from "@/lib/deadlines";
import type { Case } from "@/lib/types";
import { runTurn } from "./turn";

// Friday 20.11.2026, 09:30 in Munich: a normal Werktag.
const DAY = "2026-11-20";
let clock = berlinTime(DAY, 9, 30);
const tick = () => (clock = new Date(clock.getTime() + 60_000));

async function chat(team = IDS.teamEstrich) {
  const user = team === IDS.teamEstrich ? IDS.userPolierEstrich : IDS.userPolierAusbau;
  const conv = await createConversation({ team_id: team, user_id: user, kind: "chat" }, clock);
  return (text: string) => runTurn({ conversationId: conv.id, text, now: tick() });
}

const live = async () => (await listCases(IDS.project)).filter((c) => c.status !== "entwurf");
const check = (c: Case, id: string) => c.checks.find((x) => x.id === id);

beforeEach(async () => {
  clock = berlinTime(DAY, 9, 30);
  await store().reset(buildSeed(clock));
});

describe("scenario 1: morning, all according to plan", () => {
  it("writes a diary entry and opens no case", async () => {
    const say = await chat();
    const r = await say("Alles nach Plan");
    expect(r.reply).toBe("Im Bautagebuch notiert.");
    expect(await listCases(IDS.project)).toHaveLength(0);
    const report = await getDailyReport(IDS.teamEstrich, DAY);
    expect(JSON.stringify(report?.data)).toContain("Arbeiten nach Plan");
  });
});

describe("golden path (English)", () => {
  it("asks one question, reads back, and creates a ready hindrance notice", async () => {
    const say = await chat();
    const r1 = await say("The electricians haven't cleared the second floor. Our screed crew has been standing since seven, four people waiting.");
    expect(r1.language).toBe("en");
    expect(r1.reply).toBe("How long do you expect this to last?");
    expect(r1.question?.field).toBe("expected_duration");

    const r2 = await say("About two days.");
    expect(r2.awaiting_confirm).toBe(true);
    expect(r2.reply).toMatch(/^Let me read it back\./);
    expect(r2.reply).toMatch(/Is that correct\?$/);
    expect(r2.reply_de).toMatch(/^Ich fasse zusammen\./);

    const r3 = await say("Yes.");
    expect(r3.reply).toBe("Thank you. The document is now with the site manager for checking.");
    const [c] = await live();
    expect(c.doc_type).toBe("behinderungsanzeige");
    expect(c.status).toBe("bereit");
    expect(c.sphere).toBe("client");
    expect(c.reference).toBe("KL-2026-0042");
    expect(c.facts).toMatchObject({
      area: "2.OG",
      idle_staff: 4,
      affected_works: "Estricharbeiten 2.OG",
      expected_duration: "ca. 2 Arbeitstage",
      start_at: berlinTime(DAY, 7, 0).toISOString(),
    });
    expect(check(c, "recipient")).toMatchObject({ light: "yellow", reason_de: "Adressat: Bauherr (Architekt ohne Vollmacht)" });
    expect(check(c, "sphere")?.light).toBe("green");
    expect(check(c, "timing_unverzueglich")?.light).toBe("green");
    expect(check(c, "required_fields")?.light).toBe("green");
    expect(c.missing_fields).toEqual([]);
    const kinds = (await listEvents({ caseId: c.id })).map((e) => e.kind);
    expect(kinds).toContain("case_confirmed");
  });
});

describe("scenario 2: Russian hindrance", () => {
  it("needs at most two questions", async () => {
    const say = await chat();
    const r1 = await say("Электрики не освободили второй этаж, 4 человека простаивают");
    expect(r1.language).toBe("ru");
    expect(r1.reply).toBe("С какого момента точно? Дата и время, пожалуйста.");
    const r2 = await say("с семи утра");
    expect(r2.reply).toBe("Как долго это, по-вашему, продлится?");
    const r3 = await say("не знаю");
    expect(r3.awaiting_confirm).toBe(true);
    expect(r3.reply_de).toContain("Behinderungsanzeige");
    await say("да");
    const [c] = await live();
    expect(c).toMatchObject({ doc_type: "behinderungsanzeige", sphere: "client", status: "bereit" });
    expect(c.declined_fields).toContain("expected_duration");
  });
});

describe("scenario 3: verbal instruction (Russian)", () => {
  it("opens Mehrkosten + Anordnung, asks 'already started?' first, addresses the client", async () => {
    const say = await chat();
    const r1 = await say("Архитектор Вебер сказал устно: 3 дополнительные противопожарные двери");
    expect(r1.reply).toBe("Вы уже начали эту дополнительную работу?");
    const r2 = await say("нет, ещё не начали");
    expect(r2.question?.field).toBe("instruction_date");
    const r3 = await say("сегодня");
    expect(r3.question?.field).toBe("planned_start");
    const r4 = await say("в понедельник");
    expect(r4.awaiting_confirm).toBe(true);
    await say("да");
    const cases = await live();
    expect(cases.map((c) => c.doc_type).sort()).toEqual(["anordnung_bestaetigung", "mehrkostenanzeige"]);
    for (const c of cases) {
      expect(check(c, "recipient")).toMatchObject({ light: "yellow", reason_de: "Adressat: Bauherr (Architekt ohne Vollmacht)" });
      expect(c.facts.instructed_by).toBe("Thomas Weber (Architekt)");
      expect(c.facts.instruction_date).toBe(DAY);
    }
    const mk = cases.find((c) => c.doc_type === "mehrkostenanzeige")!;
    expect(mk.facts).toMatchObject({ work_started: false, planned_start: "2026-11-23", verbal: true });
    expect(check(mk, "timing_mehrkosten")?.light).toBe("green");
  });
});

describe("scenario 4: subcontractor did not show up", () => {
  it("prepares a request to remedy, not a hindrance notice", async () => {
    const say = await chat(IDS.teamAusbau);
    const r1 = await say("Die Trockenbauer sind heute nicht gekommen.");
    expect(r1.reply).toContain("Nowak Trockenbau GmbH");
    const drafts = await listCases(IDS.project);
    expect(drafts.map((c) => c.doc_type)).toEqual(["verzug_nu"]);
    expect(drafts[0]).toMatchObject({ sphere: "own_sub" });
    expect(drafts[0].flags).toContain("internal_risk");
    const risk = (await listEvents({ projectId: IDS.project })).find((e) => e.kind === "risk_flag");
    expect(String(risk?.payload.reason_de)).toMatch(/^Hinweis: vermutlich eigene Sphäre/);
  });
});

describe("scenario 5: storm", () => {
  it("opens a hindrance notice without cost reservation", async () => {
    const say = await chat();
    await say("Sturm, der Kran stand den ganzen Tag.");
    const [c] = await listCases(IDS.project);
    expect(c).toMatchObject({ doc_type: "behinderungsanzeige", sphere: "weather" });
    expect(c.facts._cost_reservation).toBe(false);
    expect(c.flags).toContain("no_cost_reservation");
    expect(check(c, "sphere")?.reason_de).toMatch(/kein Kostenvorbehalt.*Hinweis/);
  });
});

describe("scenario 6: evening quantity below plan", () => {
  it("computes 38 % and prepares a notice to the floor layer", async () => {
    clock = berlinTime(DAY, 16, 0);
    const say = await chat();
    const r = await say("Estrich 2.OG heute nur 15 m²");
    expect(r.reply).toContain("38 %");
    expect(r.reply).toContain("Huber Bodenbeläge");
    const [c] = await live();
    expect(c).toMatchObject({ doc_type: "info_folgegewerk", status: "bereit" });
    expect(c.facts.forecast_delay_days).toBeGreaterThan(0);
    expect(check(c, "recipient")?.light).toBe("green");
  });
});

describe("scenario 8: two events in one utterance", () => {
  it("opens a case for each event", async () => {
    const say = await chat();
    await say(
      "Die Elektriker haben das 2.OG nicht freigegeben, 4 Leute warten seit 7 Uhr. Außerdem hat Architekt Weber gesagt, wir sollen 3 zusätzliche Brandschutztüren einbauen.",
    );
    const types = (await listCases(IDS.project)).map((c) => c.doc_type).sort();
    expect(types).toEqual(["anordnung_bestaetigung", "behinderungsanzeige", "mehrkostenanzeige"]);
  });
});

describe("scenario 9: vague utterance", () => {
  it("asks a clarifying question and opens no case", async () => {
    const say = await chat();
    const r = await say("es ist irgendwie blöd heute");
    expect(r.reply).toMatch(/\?$/);
    expect(await listCases(IDS.project)).toHaveLength(0);
  });
});

describe("scenario 10: extra work already started", () => {
  it("turns the timing light red and escalates", async () => {
    const say = await chat();
    await say("Architekt Weber hat heute gesagt: 3 zusätzliche Brandschutztüren im 2.OG.");
    const r = await say("Ja, wir haben schon begonnen.");
    expect(r.cases.find((c) => c.doc_type === "mehrkostenanzeige")?.facts.work_started).toBe(true);
    const mk = (await listCases(IDS.project)).find((c) => c.doc_type === "mehrkostenanzeige")!;
    expect(check(mk, "timing_mehrkosten")).toMatchObject({ light: "red", reason_de: "Ankündigung vor Ausführung versäumt" });
    expect(mk.flags).toContain("escalate");
  });
});

describe("sphere unclear", () => {
  it("asks who hired a trade that is not in the project", async () => {
    const say = await chat();
    const r1 = await say("Die Fensterbauer blockieren das 2.OG, 4 Leute warten seit 7 Uhr.");
    expect(r1.reply).toBe("Wer hat das Gewerk Fenster beauftragt: der Bauherr oder wir?");
    const r2 = await say("Der Bauherr.");
    expect(r2.cases[0]).toMatchObject({ sphere: "client", doc_type: "behinderungsanzeige" });
  });
});

describe("corrections and ending", () => {
  it("applies a correction after the readback", async () => {
    const say = await chat();
    await say("The electricians haven't cleared the second floor. Our screed crew has been standing since seven, four people waiting.");
    await say("About two days.");
    const r = await say("No, five people.");
    expect(r.awaiting_confirm).toBe(true);
    expect(r.cases[0].facts.idle_staff).toBe(5);
  });

  it("saves unconfirmed drafts for the office when the user hangs up", async () => {
    const say = await chat();
    await say("The electricians haven't cleared the second floor. Our screed crew has been standing since seven, four people waiting.");
    const r = await say("That's all, bye.");
    expect(r.ended).toBe(true);
    const [c] = await listCases(IDS.project);
    expect(c.status).toBe("unvollstaendig");
    expect(c.flags).toContain("unconfirmed");
  });
});
