import { describe, expect, it } from "vitest";
import { berlinTime } from "@/lib/deadlines";
import { IDS } from "@/lib/ids";
import type { Case } from "@/lib/types";
import { dashboardFromSeed, demoSeed } from "./from-seed";

const now = berlinTime("2026-11-20", 8, 30); // a Friday
const seed = demoSeed(now); // what "Demo zurücksetzen" loads
type View = ReturnType<typeof dashboardFromSeed>;
const kpi = (v: View, key: string) => v.kpis.find((k) => k.key === key)!;
const cell = (v: View, code: string, trade: string) => v.heatmap.rows.find((r) => r.code === code)!.cells.find((c) => c.trade === trade)!;

const callCase: Case = {
  ...seed.case![0],
  id: "call-case",
  project_id: IDS.project,
  team_id: IDS.teamEstrich,
  doc_type: "behinderungsanzeige",
  status: "bereit",
  reference: "KL-2026-0042",
  facts: { _trade: "Elektro", area: "2.OG", start_at: berlinTime("2026-11-20", 7, 0).toISOString(), expected_duration: "ca. 2 Arbeitstage" },
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
};

describe("dashboard of the reset demo (all numbers computed)", () => {
  const v = dashboardFromSeed(seed, now);

  it("three sites with their codes", () => {
    expect(v.sites.map((s) => `${s.code} ${s.name}`)).toEqual(["A Neubau Bürogebäude München", "B Wohnanlage Riem, Haus B", "C Sanierung Wohnhaus Schwabing"]);
  });

  it("KPIs come from the letters, reports, schedule and estimates", () => {
    const open = seed.case!.filter((c) => c.doc_type !== "bautagesbericht" && (c.status === "unvollstaendig" || c.status === "bereit")).length;
    expect(kpi(v, "open").value).toBe(open);
    expect(kpi(v, "missing")).toMatchObject({ value: 3, note: "A Estrich, B Fassade, C Innenausbau" });
    expect(kpi(v, "claims").note).toBe("vorläufig");
    expect(kpi(v, "claims").value).toBeGreaterThan(0);
    expect(kpi(v, "delay").value).toBeGreaterThanOrEqual(4);
    for (const k of v.kpis) expect(k.spark).toHaveLength(14);
  });

  it("A: Elektro 2.OG two days late, the Estrich that waits for it inherits the delay", () => {
    expect(cell(v, "A", "Elektro")).toMatchObject({ status: "amber", delay: 2, hindrance: null });
    expect(cell(v, "A", "Estrich")).toMatchObject({ status: "amber", delay: 2 });
    expect(cell(v, "A", "Estrich").reason).toMatch(/wartet auf Elektro 2\.OG/);
    expect(cell(v, "A", "Trockenbau").status).toBe("green");
    const estrich = v.schedule.rows.find((r) => r.trade === "Estrich" && r.area === "2.OG")!;
    expect(estrich).toMatchObject({ delay: 2, waits_for: "Elektro 2.OG" });
  });

  it("open hindrances of the history are red (Riem Fenster)", () => {
    expect(cell(v, "B", "Fenster")).toMatchObject({ status: "red", hindrance: { reference: "KL-2026-0036" } });
  });

  it("reports grid, pipeline and feed", () => {
    const fassade = v.completeness.rows.find((r) => r.code === "B" && r.team === "Team Fassade")!;
    expect(fassade.cells.at(-1)!.state).toBe("missing");
    const letters = seed.case!.filter((c) => c.doc_type !== "bautagesbericht").length;
    expect(v.pipeline.steps.reduce((s, x) => s + x.count, 0)).toBe(letters);
    expect(v.feed.length).toBeGreaterThan(5);
    expect(v.feed.some((f) => f.source === "checkin")).toBe(true);
    expect(v.feed.filter((f) => f.href).every((f) => f.href!.startsWith("/admin/"))).toBe(true);
  });

  it("filters narrow every widget", () => {
    const a = dashboardFromSeed(seed, now, { project: IDS.project });
    expect(a.heatmap.rows.map((r) => r.code)).toEqual(["A"]);
    expect(kpi(a, "missing")).toMatchObject({ value: 1, note: "A Estrich" });
    const elektro = dashboardFromSeed(seed, now, { trade: "Elektro" });
    expect(elektro.heatmap.trades).toEqual(["Elektro"]);
    expect(elektro.trade_bars.bars.map((b) => b.trade)).toEqual(["Elektro"]);
    const seven = dashboardFromSeed(seed, now, { days: 7 });
    expect(seven.completeness.days).toHaveLength(7);
    expect(seven.kpis[0].spark).toHaveLength(7);
  });

  it("the call's Behinderungsanzeige: one more open case, A × Elektro turns red, the Estrich row shows it", () => {
    const after = dashboardFromSeed({ ...seed, case: [...seed.case!, callCase] }, now);
    expect(kpi(after, "open").value).toBe(kpi(v, "open").value + 1);
    expect(cell(after, "A", "Elektro")).toMatchObject({ status: "red", hindrance: { reference: "KL-2026-0042" } });
    const row = after.schedule.rows.find((r) => r.trade === "Estrich" && r.area === "2.OG")!;
    expect(row.hindrances[0]).toMatchObject({ reference: "KL-2026-0042", start: "2026-11-20" });
  });

  it("a draft of a running call does not count yet", () => {
    const draft = dashboardFromSeed({ ...seed, case: [...seed.case!, { ...callCase, status: "entwurf" }] }, now);
    expect(kpi(draft, "open").value).toBe(kpi(v, "open").value);
    expect(cell(draft, "A", "Elektro").status).toBe("amber");
  });
});
