import { describe, expect, it } from "vitest";
import { berlinTime } from "@/lib/deadlines";
import { buildSeed, IDS } from "@/lib/db/seed";
import { REGISTRY } from "@/lib/doctypes";
import type { RulesCtx } from "./context";
import { evaluateCase, missingFields, nextQuestionField } from "./evaluate";
import { dependents, planVsActual } from "./plan-actual";
import { matchContact, resolveRecipient } from "./recipient";
import { canonicalTradeName, computeSphere, resolveTrade, routeHindrance } from "./sphere";

const NOW = berlinTime("2026-11-20", 9, 30);
const seed = buildSeed(NOW);
const ctx: RulesCtx = {
  project: seed.project![0],
  contacts: seed.contact!,
  trades: seed.trade!,
  teams: seed.team!,
  schedule: seed.schedule_item!,
};

describe("sphere", () => {
  it("resolves multilingual trade names", () => {
    expect(resolveTrade("the electricians", ctx.trades)?.name).toBe("Elektro");
    expect(resolveTrade("электрики", ctx.trades)?.name).toBe("Elektro");
    expect(resolveTrade("elektrycy", ctx.trades)?.name).toBe("Elektro");
    expect(resolveTrade("Trockenbauer", ctx.trades)?.name).toBe("Trockenbau");
    expect(resolveTrade("suchej zabudowy", ctx.trades)?.name).toBe("Trockenbau");
    expect(resolveTrade("plumbers", ctx.trades)).toBeNull(); // not in this project
    expect(canonicalTradeName("plumbers")).toBe("Sanitär");
  });

  it("client-hired trade → client sphere → Behinderungsanzeige with cost reservation", () => {
    const s = computeSphere({ causeKind: "trade", tradeGuess: "electricians", reportingTeamId: IDS.teamEstrich }, ctx);
    expect(s.sphere).toBe("client");
    expect(routeHindrance(s.sphere, s.tradeName)).toEqual({ kind: "letter", doc_type: "behinderungsanzeige", cost_reservation: true });
  });

  it("own subcontractor → Abhilfeaufforderung, internal risk", () => {
    const s = computeSphere({ causeKind: "trade", tradeGuess: "Trockenbauer", reportingTeamId: IDS.teamAusbau }, ctx);
    expect(s.sphere).toBe("own_sub");
    expect(routeHindrance(s.sphere, s.tradeName)).toMatchObject({ kind: "letter", doc_type: "verzug_nu" });
  });

  it("own crew → diary only", () => {
    expect(computeSphere({ causeKind: "own", tradeGuess: null }, ctx).sphere).toBe("own_team");
    // The reporting team's own trade is its own sphere.
    expect(computeSphere({ causeKind: "trade", tradeGuess: "Estrich", reportingTeamId: IDS.teamEstrich }, ctx).sphere).toBe("own_team");
    expect(routeHindrance("own_team", null)).toEqual({ kind: "diary", internal_risk: true });
  });

  it("weather → time extension only", () => {
    const s = computeSphere({ causeKind: "weather", tradeGuess: null }, ctx);
    expect(routeHindrance(s.sphere, null)).toEqual({ kind: "letter", doc_type: "behinderungsanzeige", cost_reservation: false });
  });

  it("missing plans from the client → client sphere", () => {
    expect(computeSphere({ causeKind: "client_provision", tradeGuess: null }, ctx).sphere).toBe("client");
  });

  it("unknown trade → unclear, answered by who hired it", () => {
    expect(computeSphere({ causeKind: "trade", tradeGuess: "plumbers" }, ctx)).toMatchObject({ sphere: "unclear", tradeName: "Sanitär" });
    expect(routeHindrance("unclear", "Sanitär")).toEqual({ kind: "ask_sphere", trade: "Sanitär" });
    expect(computeSphere({ causeKind: "trade", tradeGuess: "plumbers", hiredBy: "client" }, ctx).sphere).toBe("client");
    expect(computeSphere({ causeKind: "trade", tradeGuess: "plumbers", hiredBy: "us" }, ctx).sphere).toBe("own_sub");
  });
});

describe("recipient", () => {
  it("matches contacts by name or role word", () => {
    expect(matchContact("Architekt Weber", ctx.contacts)?.id).toBe(IDS.contactArchitekt);
    expect(matchContact("the architect", ctx.contacts)?.id).toBe(IDS.contactArchitekt);
    expect(matchContact("Frau Dr. Lang", ctx.contacts)?.id).toBe(IDS.contactBauherr);
    expect(matchContact("архитектор", ctx.contacts)?.id).toBe(IDS.contactArchitekt);
    expect(matchContact("someone", ctx.contacts)).toBeNull();
  });

  it("client letters go to the Bauherr with authority; architect without authority → amber", () => {
    const r = resolveRecipient("client_with_authority", ctx);
    expect(r.to?.id).toBe(IDS.contactBauherr);
    expect(r.check).toMatchObject({ light: "yellow", reason_de: "Adressat: Bauherr (Architekt ohne Vollmacht)" });
  });

  it("instruction by the architect: to Bauherr, cc architect", () => {
    const r = resolveRecipient("client_with_authority", ctx, { instructedBy: "Thomas Weber (Architekt)" });
    expect(r.to?.id).toBe(IDS.contactBauherr);
    expect(r.cc.map((c) => c.id)).toEqual([IDS.contactArchitekt]);
    expect(r.check.light).toBe("yellow");
  });

  it("green when the client contact has authority and nobody was replaced", () => {
    const noArchitect = { ...ctx, contacts: ctx.contacts.filter((c) => c.role !== "architekt") };
    expect(resolveRecipient("client_with_authority", noArchitect).check.light).toBe("green");
  });

  it("red without any authorised contact", () => {
    const none = { ...ctx, contacts: ctx.contacts.map((c) => ({ ...c, has_authority: false })) };
    expect(resolveRecipient("client_with_authority", none).check.light).toBe("red");
  });

  it("subcontractor letters go to the NU contact", () => {
    expect(resolveRecipient("subcontractor", ctx, { subcontractorContactId: IDS.contactTrockenbau }).to?.organisation).toBe("Nowak Trockenbau GmbH");
    expect(resolveRecipient("subcontractor", ctx).check.light).toBe("red");
  });
});

describe("evaluateCase", () => {
  const golden = {
    start_at: berlinTime("2026-11-20", 7).toISOString(),
    area: "2.OG",
    cause: "Die Elektroinstallation im 2.OG ist nicht fertiggestellt; der Bereich wurde nicht freigegeben.",
    affected_works: "Estricharbeiten 2.OG",
    idle_staff: 4,
    trade: "Elektro",
  };

  it("golden path: all green except the amber recipient, deadline 'unverzüglich – heute'", () => {
    const ev = evaluateCase({ def: REGISTRY.behinderungsanzeige, facts: golden, sphere: "client", confidence: 0.92, now: NOW }, ctx);
    expect(ev.missing_fields).toEqual([]);
    const byId = Object.fromEntries(ev.checks.map((c) => [c.id, c]));
    expect(byId.required_fields.light).toBe("green");
    expect(byId.recipient).toMatchObject({ light: "yellow", reason_de: "Adressat: Bauherr (Architekt ohne Vollmacht)" });
    expect(byId.timing_unverzueglich.light).toBe("green");
    expect(byId.sphere).toMatchObject({ light: "green", reason_de: "Sphäre des Auftraggebers: Elektro vom Bauherrn beauftragt" });
    expect(byId.channel.light).toBe("green");
    expect(byId.confidence.light).toBe("green");
    expect(ev.deadline).toMatchObject({ status: "due_today", label_de: "unverzüglich – heute" });
    expect(ev.deadline_rule).toBe("unverzueglich");
  });

  it("every light carries a German reason", () => {
    for (const def of Object.values(REGISTRY)) {
      const ev = evaluateCase({ def, facts: {}, sphere: "unclear", confidence: 0.4, now: NOW }, ctx);
      for (const c of ev.checks) expect(c.reason_de.length).toBeGreaterThan(5);
    }
  });

  it("missing fields are amber and listed by German label", () => {
    const ev = evaluateCase({ def: REGISTRY.behinderungsanzeige, facts: { area: "2.OG" }, sphere: "client", now: NOW }, ctx);
    expect(ev.missing_fields).toEqual(["start_at", "cause", "affected_works", "idle_staff"]);
    expect(ev.checks[0]).toMatchObject({ light: "yellow" });
    expect(ev.checks[0].reason_de).toContain("Beginn der Behinderung");
  });

  it("timing: next Werktag amber, later red", () => {
    const late = evaluateCase({ def: REGISTRY.behinderungsanzeige, facts: golden, sphere: "client", now: berlinTime("2026-11-21", 9) }, ctx);
    expect(late.checks.find((c) => c.id === "timing_unverzueglich")?.light).toBe("yellow");
    const later = evaluateCase({ def: REGISTRY.behinderungsanzeige, facts: golden, sphere: "client", now: berlinTime("2026-11-24", 9) }, ctx);
    expect(later.checks.find((c) => c.id === "timing_unverzueglich")?.light).toBe("red");
  });

  it("Mehrkosten: work already started → red + escalate (scenario 10)", () => {
    const ev = evaluateCase(
      {
        def: REGISTRY.mehrkostenanzeige,
        facts: { work_started: true, instructed_by: "Thomas Weber (Architekt)", description: "3 zusätzliche Brandschutztüren" },
        sphere: null,
        now: NOW,
      },
      ctx,
    );
    expect(ev.checks.find((c) => c.id === "timing_mehrkosten")).toMatchObject({ light: "red", reason_de: "Ankündigung vor Ausführung versäumt" });
    expect(ev.flags).toContain("escalate");
    expect(ev.recipient.cc[0]?.id).toBe(IDS.contactArchitekt);
    expect(ev.checks.find((c) => c.id === "lv_coverage")).toMatchObject({ light: "yellow", reason_de: "Bitte prüfen: im LV enthalten?" });
  });

  it("weather: amber with Hinweis, no verdict wording", () => {
    const ev = evaluateCase({ def: REGISTRY.behinderungsanzeige, facts: golden, sphere: "weather", now: NOW }, ctx);
    const s = ev.checks.find((c) => c.id === "sphere")!;
    expect(s.light).toBe("yellow");
    expect(s.reason_de).toContain("kein Kostenvorbehalt");
    expect(s.reason_de).toContain("Hinweis");
  });

  it("own sphere: red Hinweis + internal risk, never 'kein Anspruch'", () => {
    const ev = evaluateCase({ def: REGISTRY.behinderungsanzeige, facts: golden, sphere: "own_sub", now: NOW }, ctx);
    const s = ev.checks.find((c) => c.id === "sphere")!;
    expect(s.light).toBe("red");
    expect(s.reason_de.startsWith("Hinweis:")).toBe(true);
    expect(s.reason_de.toLowerCase()).not.toContain("kein anspruch");
    expect(ev.flags).toContain("internal_risk");
  });

  it("low confidence → amber", () => {
    const ev = evaluateCase({ def: REGISTRY.behinderungsanzeige, facts: golden, sphere: "client", confidence: 0.45, now: NOW }, ctx);
    expect(ev.checks.find((c) => c.id === "confidence")?.light).toBe("yellow");
  });

  it("channel: sent with delivery log green, without confirmation amber", () => {
    const sent = evaluateCase(
      { def: REGISTRY.behinderungsanzeige, facts: golden, sphere: "client", now: NOW, channel: { sentAt: NOW.toISOString(), delivered: true } },
      ctx,
    );
    expect(sent.checks.find((c) => c.id === "channel")?.light).toBe("green");
    const pending = evaluateCase(
      { def: REGISTRY.behinderungsanzeige, facts: golden, sphere: "client", now: NOW, channel: { sentAt: NOW.toISOString(), delivered: false } },
      ctx,
    );
    expect(pending.checks.find((c) => c.id === "channel")?.light).toBe("yellow");
  });
});

describe("questions", () => {
  const def = REGISTRY.behinderungsanzeige;

  it("asks required fields first, then optional ones marked ask_if_missing", () => {
    expect(nextQuestionField(def, {}, [], [])).toBe("start_at");
    const allRequired = { start_at: "x", area: "2.OG", cause: "c", affected_works: "w", idle_staff: 4 };
    expect(missingFields(def, allRequired)).toEqual([]);
    expect(nextQuestionField(def, allRequired, [], [])).toBe("expected_duration");
  });

  it("never asks more than 3 questions per case", () => {
    expect(nextQuestionField(def, {}, ["start_at", "area", "cause"], [])).toBeNull();
  });

  it("skips declined fields", () => {
    expect(nextQuestionField(def, { start_at: "x", area: "2.OG", cause: "c", affected_works: "w", idle_staff: 4 }, [], ["expected_duration"])).toBeNull();
  });

  it("Mehrkosten always asks 'already started?' first", () => {
    expect(nextQuestionField(REGISTRY.mehrkostenanzeige, { description: "3 Türen", instructed_by: "Weber (Architekt)" }, [], [])).toBe("work_started");
  });
});

describe("plan vs actual (scenario 6)", () => {
  it("Estrich 15 m² instead of 40 → 38 %, delay forecast, Bodenbelag informed", () => {
    const item = ctx.schedule!.find((s) => s.id === IDS.schedEstrich2)!;
    const pa = planVsActual(item, [40, 15], 3)!;
    expect(Math.round(pa.daily_rate * 100)).toBe(38);
    expect(pa.remaining_qty).toBe(145);
    expect(pa.forecast_delay_days).toBeCloseTo(2.3, 1);
    expect(pa.deviation).toBe(true);
    expect(dependents(item.id, ctx.schedule!).map((s) => s.id)).toEqual([IDS.schedBodenbelag2]);
  });

  it("on plan → no deviation", () => {
    const pa = planVsActual({ planned_qty: 200, planned_per_day: 40 }, [40, 40], 3)!;
    expect(pa.deviation).toBe(false);
  });
});
