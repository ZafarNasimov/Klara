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
const shown = (v: View, code: string) =>
  v.heatmap.rows
    .find((r) => r.code === code)!
    .cells.filter((c) => c.status !== "none")
    .map((c) => `${c.trade}:${c.status}:${c.delay}`);

/** The Behinderungsanzeige of the golden-path call (Scene 2). */
const callCase: Case = {
  ...seed.case![0],
  id: "call-case",
  project_id: IDS.project,
  team_id: IDS.teamEstrich,
  doc_type: "behinderungsanzeige",
  status: "bereit",
  reference: "KL-2026-0042",
  parent_case_id: null,
  facts: { _trade: "Elektro", area: "2.OG", start_at: berlinTime("2026-11-20", 7, 0).toISOString(), expected_duration: "ca. 2 Arbeitstage" },
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
};
const before = dashboardFromSeed(seed, now);
const after = dashboardFromSeed({ ...seed, case: [...seed.case!, callCase] }, now);

describe("dashboard of the reset demo (all numbers computed)", () => {
  it("three sites as in the pitch", () => {
    expect(before.sites.map((s) => `${s.code} ${s.name}`)).toEqual(["A Neubau Bürogebäude Schwabing", "B Wohnanlage Riem, Haus 2", "C Schule Pasing"]);
    expect(before.site_map.map((s) => `${s.code} ${s.short}`)).toEqual(["A Schwabing", "B Riem", "C Pasing"]);
  });

  it("before the call: Elektro × Riem +1 (amber), Estrich green, A on plan, C only Fassade amber", () => {
    expect(cell(before, "B", "Elektro")).toMatchObject({ status: "amber", delay: 1, hindrance: null });
    expect(cell(before, "B", "Estrich")).toMatchObject({ status: "green", delay: 0 });
    expect(shown(before, "A").every((c) => c.includes(":green:"))).toBe(true);
    expect(shown(before, "C").filter((c) => !c.includes(":green:"))).toEqual(["Fassade:amber:0"]);
    expect(cell(before, "C", "Fassade").reason).toBe("Keine Mengenmeldung seit 2 Arbeitstagen");
    expect(before.site_map.map((s) => s.status)).toEqual(["green", "amber", "amber"]);
  });

  it("after the call: Elektro × Riem red +3, Estrich amber +2, one more open case, more delay days", () => {
    expect(cell(after, "B", "Elektro")).toMatchObject({ status: "red", delay: 3, hindrance: { reference: "KL-2026-0042" } });
    expect(cell(after, "B", "Estrich")).toMatchObject({ status: "amber", delay: 2 });
    expect(cell(after, "B", "Estrich").reason).toMatch(/wartet auf Elektro 2\.OG/);
    expect(kpi(after, "open").value).toBe(kpi(before, "open").value + 1);
    expect(kpi(after, "delay").value).toBeGreaterThan(kpi(before, "delay").value);
    expect(after.site_map.find((s) => s.code === "B")!.status).toBe("red");
    expect(after.actions.items[0]).toMatchObject({ kind: "hindrance", text: "Elektro · Riem · Behinderung offen", href: "/admin/case/call-case" });
    const row = after.schedule.rows.find((r) => r.trade === "Elektro" && r.area === "2.OG")!;
    expect(row.hindrances[0]).toMatchObject({ reference: "KL-2026-0042", start: "2026-11-20" });
  });

  it("plan vs. Ist: Elektro 85/72 (worst), Sanitär 60/64, Trockenbau 45/40, Estrich 55/38", () => {
    const bar = (t: string) => before.trade_bars.bars.find((b) => b.trade === t)!;
    expect([bar("Elektro").plan, bar("Elektro").actual]).toEqual([85, 72]);
    expect([bar("Sanitär").plan, bar("Sanitär").actual]).toEqual([60, 64]);
    expect([bar("Trockenbau").plan, bar("Trockenbau").actual]).toEqual([45, 40]);
    expect([bar("Estrich").plan, bar("Estrich").actual]).toEqual([55, 38]);
    expect(before.trade_bars.bars.filter((b) => b.worst).map((b) => b.trade)).toEqual(["Elektro"]);
  });

  it("history hindrances that ended (Behinderung-Ende, expected duration over) are not red", () => {
    expect(after.heatmap.rows.flatMap((r) => r.cells).filter((c) => c.status === "red").map((c) => c.hindrance?.reference)).toEqual(["KL-2026-0042"]);
  });

  it("KPIs, reports grid, pipeline, feed", () => {
    expect(kpi(before, "missing")).toMatchObject({ value: 3 });
    expect(kpi(before, "claims").note).toBe("vorläufig");
    for (const k of before.kpis) expect(k.spark).toHaveLength(14);
    const letters = seed.case!.filter((c) => c.doc_type !== "bautagesbericht").length;
    expect(before.pipeline.steps.reduce((s, x) => s + x.count, 0)).toBe(letters);
    expect(before.feed.length).toBeGreaterThan(5);
    expect(before.feed.every((f) => !/^BTB-/.test(f.title))).toBe(true); // readable titles, the ID separately
    expect(before.actions.items[0].text).toBe("Elektro · Riem · +1 Tag");
  });

  it("filters narrow every widget", () => {
    const b = dashboardFromSeed(seed, now, { project: IDS.project });
    expect(b.heatmap.rows.map((r) => r.code)).toEqual(["B"]);
    const elektro = dashboardFromSeed(seed, now, { trade: "Elektro" });
    expect(elektro.heatmap.trades).toEqual(["Elektro"]);
    expect(elektro.trade_bars.bars.map((x) => x.trade)).toEqual(["Elektro"]);
    const seven = dashboardFromSeed(seed, now, { days: 7 });
    expect(seven.completeness.days).toHaveLength(7);
    expect(seven.kpis[0].spark).toHaveLength(7);
  });

  it("site list: why (worst trade), contract, today's teams, last event; the call turns B red", () => {
    const site = (v: View, code: string) => v.site_map.find((s) => s.code === code)!;
    expect(site(before, "A")).toMatchObject({ status: "green", status_text: "Im Plan", contract: "VOB/B", open: 1, delay: 0, teams_today: 2, missing_today: 0, hindrance: false });
    expect(site(before, "B")).toMatchObject({ status: "amber", status_text: "≤ 2 Tage Verzug", delay: 1, teams_today: 1, missing_today: 1, hindrance: false });
    expect(site(before, "C")).toMatchObject({ status: "amber", status_text: "Keine Mengenmeldung", contract: "BGB", open: 2, missing_today: 2 });
    expect(site(after, "B")).toMatchObject({ status: "red", status_text: "Behinderung offen", hindrance: true, open: site(before, "B").open + 1 });
    expect(site(after, "B").delay).toBeGreaterThan(site(before, "B").delay);
    // Missing reports split by site add up to the KPI; the last event is the newest feed line, never in the future.
    expect(before.site_map.reduce((n, s) => n + s.missing_today, 0)).toBe(kpi(before, "missing").value);
    expect(site(before, "A").last_event).toEqual({ at: "2026-11-20T06:45:00.000Z", text: "Tagesbericht Rohbau validiert", ref: "BTB-20261119-ROHBAU" });
    for (const s of before.site_map) expect(s.last_event!.at <= before.now).toBe(true);
    // Every "Handlungsbedarf" line names its site (linked hover with the map).
    expect(after.actions.items[0].project_id).toBe(IDS.project);
    expect(before.actions.items.map((a) => before.site_map.find((s) => s.id === a.project_id)?.code)).toEqual(["B", "B", "C", "C", "A", "C", "C"]);
  });

  it("filters: sites outside the site, team or trade filter are ghosts on the map", () => {
    expect(before.site_map.every((s) => s.in_filter && !s.selected)).toBe(true);
    expect(dashboardFromSeed(seed, now, { trade: "Elektro" }).site_map.map((s) => s.in_filter)).toEqual([false, true, true]);
    const b = dashboardFromSeed(seed, now, { project: IDS.project });
    expect(b.site_map.map((s) => `${s.code}:${s.in_filter}:${s.selected}`)).toEqual(["A:false:false", "B:true:true", "C:false:false"]);
    const bElektro = dashboardFromSeed(seed, now, { project: IDS.project, trade: "Elektro" });
    expect(bElektro.site_map.map((s) => s.in_filter)).toEqual([false, true, false]);
  });

  it("a draft of a running call does not count yet", () => {
    const draft = dashboardFromSeed({ ...seed, case: [...seed.case!, { ...callCase, status: "entwurf" }] }, now);
    expect(kpi(draft, "open").value).toBe(kpi(before, "open").value);
    expect(cell(draft, "B", "Elektro").status).toBe("amber");
  });
});
