import { describe, expect, it } from "vitest";
import { berlinTime } from "@/lib/deadlines";
import { REGISTRY } from "@/lib/doctypes";
import { buildSeed } from "@/lib/db/seed";
import { computeSphere, evaluateCase, nextQuestionField, planVsActual, routeHindrance, type RulesCtx } from "./index";

const seed = buildSeed(new Date("2026-11-20T08:00:00Z"));
const ctx: RulesCtx = { project: seed.project[0], contacts: seed.contact, trades: seed.trade, teams: seed.team };
const now = berlinTime("2026-11-20", 7, 30);

describe("sphere", () => {
  it("Elektro is hired by the client → client sphere, Behinderungsanzeige with reservation", () => {
    for (const guess of ["Elektro", "electricians", "электрики", "elektrycy", "elektrikçiler"]) {
      const s = computeSphere({ causeKind: "trade", tradeGuess: guess }, ctx);
      expect(s.sphere, guess).toBe("client");
    }
    expect(routeHindrance("client", "Elektro")).toEqual({ kind: "letter", doc_type: "behinderungsanzeige", cost_reservation: true });
  });

  it("Trockenbau is our NU → own_sub → verzug_nu + internal risk (scenario 4)", () => {
    const s = computeSphere({ causeKind: "trade", tradeGuess: "Trockenbauer" }, ctx);
    expect(s.sphere).toBe("own_sub");
    expect(routeHindrance(s.sphere, s.tradeName)).toEqual({ kind: "letter", doc_type: "verzug_nu", internal_risk: true });
  });

  it("Estrich is our own team → own_team → diary, no letter", () => {
    const s = computeSphere({ causeKind: "trade", tradeGuess: "screed" }, ctx);
    expect(s.sphere).toBe("own_team");
    expect(routeHindrance(s.sphere, s.tradeName).kind).toBe("diary");
  });

  it("weather → time extension only (scenario 5)", () => {
    const s = computeSphere({ causeKind: "weather", tradeGuess: null }, ctx);
    expect(s.sphere).toBe("weather");
    expect(routeHindrance("weather", null)).toEqual({ kind: "letter", doc_type: "behinderungsanzeige", cost_reservation: false });
  });

  it("unknown trade → unclear → ask; answer decides", () => {
    const s = computeSphere({ causeKind: "trade", tradeGuess: "Sanitär" }, ctx);
    expect(s.sphere).toBe("unclear");
    expect(routeHindrance("unclear", s.tradeName)).toEqual({ kind: "ask_sphere", trade: "Sanitär" });
    expect(computeSphere({ causeKind: "trade", tradeGuess: "Sanitär", hiredBy: "client" }, ctx).sphere).toBe("client");
    expect(computeSphere({ causeKind: "trade", tradeGuess: "Sanitär", hiredBy: "us" }, ctx).sphere).toBe("own_sub");
  });
});

describe("evaluateCase – Behinderungsanzeige (demo)", () => {
  const facts = {
    start_at: berlinTime("2026-11-20", 7, 0).toISOString(),
    area: "2.OG",
    cause: "Elektroarbeiten im 2.OG nicht fertiggestellt, Bereich nicht freigegeben",
    affected_works: "Estricharbeiten 2.OG",
    idle_staff: 4,
  };

  it("all required present, recipient auto-replaced to Bauherr, due today", () => {
    const e = evaluateCase(
      { def: REGISTRY.behinderungsanzeige, facts, sphere: "client", confidence: 0.92, now },
      ctx,
    );
    expect(e.missing_fields).toEqual([]);
    const byId = Object.fromEntries(e.checks.map((c) => [c.id, c]));
    expect(byId.required_fields.light).toBe("green");
    expect(byId.recipient.light).toBe("yellow");
    expect(byId.recipient.reason_de).toBe("Adressat: Bauherr (Architekt ohne Vollmacht)");
    expect(byId.timing_unverzueglich.light).toBe("green");
    expect(byId.sphere.light).toBe("green");
    expect(byId.confidence.light).toBe("green");
    expect(e.recipient.to?.name).toBe("Dr. Petra Lang");
    expect(e.deadline.label_de).toBe("unverzüglich – heute");
    // Every light has a reason.
    expect(e.checks.every((c) => c.reason_de.length > 0)).toBe(true);
  });

  it("missing fields are listed in German", () => {
    const e = evaluateCase({ def: REGISTRY.behinderungsanzeige, facts: { area: "2.OG" }, sphere: "client", now }, ctx);
    expect(e.missing_fields).toEqual(["start_at", "cause", "affected_works", "idle_staff"]);
    expect(e.checks[0].reason_de).toContain("Beginn der Behinderung");
  });

  it("timing: next Werktag yellow, later red", () => {
    const fri = { ...facts, start_at: berlinTime("2026-11-20", 7, 0).toISOString() };
    const sat = evaluateCase({ def: REGISTRY.behinderungsanzeige, facts: fri, sphere: "client", now: berlinTime("2026-11-21", 9, 0) }, ctx);
    expect(sat.checks.find((c) => c.id === "timing_unverzueglich")?.light).toBe("yellow");
    // Fri → Mon is more than one Werktag later (Saturday counts).
    const mon = evaluateCase({ def: REGISTRY.behinderungsanzeige, facts: fri, sphere: "client", now: berlinTime("2026-11-23", 9, 0) }, ctx);
    expect(mon.checks.find((c) => c.id === "timing_unverzueglich")?.light).toBe("red");
  });

  it("low confidence → yellow", () => {
    const e = evaluateCase({ def: REGISTRY.behinderungsanzeige, facts, sphere: "client", confidence: 0.4, now }, ctx);
    expect(e.checks.find((c) => c.id === "confidence")?.light).toBe("yellow");
  });
});

describe("evaluateCase – Mehrkosten (scenarios 3, 10)", () => {
  const base = {
    instruction_date: "2026-11-20",
    instructed_by: "Thomas Weber (Architekt)",
    description: "3 zusätzliche Brandschutztüren T30",
    planned_start: "2026-11-25",
  };

  it("architect without authority → Bauherr, cc architect", () => {
    const e = evaluateCase({ def: REGISTRY.mehrkostenanzeige, facts: { ...base, work_started: false }, sphere: null, now }, ctx);
    expect(e.recipient.to?.role).toBe("bauherr");
    expect(e.recipient.cc.map((c) => c.name)).toEqual(["Thomas Weber"]);
    expect(e.recipient.check.light).toBe("yellow");
    expect(e.checks.find((c) => c.id === "timing_mehrkosten")?.light).toBe("green");
    expect(e.checks.find((c) => c.id === "lv_coverage")?.reason_de).toBe("Bitte prüfen: im LV enthalten?");
    expect(e.deadline.label_de).toBe("vor Ausführungsbeginn (25.11.2026)");
  });

  it("work already started → red + escalate", () => {
    const e = evaluateCase({ def: REGISTRY.mehrkostenanzeige, facts: { ...base, work_started: true }, sphere: null, now }, ctx);
    const t = e.checks.find((c) => c.id === "timing_mehrkosten")!;
    expect(t.light).toBe("red");
    expect(t.reason_de).toBe("Ankündigung vor Ausführung versäumt");
    expect(e.flags).toContain("escalate");
  });

  it("work_started is always asked first", () => {
    expect(nextQuestionField(REGISTRY.mehrkostenanzeige, { description: "x", instructed_by: "y" }, [], [])).toBe("work_started");
  });
});

describe("question budget", () => {
  const def = REGISTRY.behinderungsanzeige;
  it("asks required first, then optional ask_if_missing", () => {
    const f = { start_at: "x", area: "x", cause: "x", affected_works: "x", idle_staff: 4 };
    expect(nextQuestionField(def, f, [], [])).toBe("expected_duration");
    expect(nextQuestionField(def, { ...f, expected_duration: "2 Tage" }, [], [])).toBeNull();
  });
  it("stops after 3 questions", () => {
    expect(nextQuestionField(def, {}, ["start_at", "area", "cause"], [])).toBeNull();
  });
  it("does not re-ask declined fields", () => {
    const f = { start_at: "x", area: "x", cause: "x", affected_works: "x", idle_staff: 4 };
    expect(nextQuestionField(def, f, [], ["expected_duration"])).toBeNull();
  });
});

describe("planVsActual (scenario 6)", () => {
  it("15 m² of 40 → 38 %, delay forecast", () => {
    const r = planVsActual({ planned_qty: 200, planned_per_day: 40 }, [15], 4)!;
    expect(Math.round(r.daily_rate * 100)).toBe(38);
    expect(r.remaining_qty).toBe(185);
    expect(r.deviation).toBe(true);
    expect(r.forecast_delay_days).toBeGreaterThan(0);
  });
});
