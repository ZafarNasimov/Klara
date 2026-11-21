import { describe, expect, it } from "vitest";
import { buildSeed } from "@/lib/db/seed";
import { berlinTime } from "@/lib/deadlines";
import { IDS } from "@/lib/ids";
import type { Case } from "@/lib/types";
import { dashboardFromSeed } from "./from-seed";

const now = berlinTime("2026-11-20", 8, 30); // a Friday
const seed = buildSeed(now);
const kpi = (v: ReturnType<typeof dashboardFromSeed>, key: string) => v.kpis.find((k) => k.key === key)!;
const cell = (v: ReturnType<typeof dashboardFromSeed>, code: string, trade: string) => v.heatmap.rows.find((r) => r.code === code)!.cells.find((c) => c.trade === trade)!;

describe("portfolio dashboard from the seed (all numbers computed)", () => {
  const v = dashboardFromSeed(seed, now);

  it("KPIs", () => {
    expect(v.sites.map((s) => s.code)).toEqual(["A", "B", "C"]);
    expect(kpi(v, "open").value).toBe(6); // A and C letters not yet validated or sent
    expect(kpi(v, "missing")).toMatchObject({ value: 3, note: "B Estrich, B Haustechnik, C Fassade" });
    expect(kpi(v, "sent").value).toBe(5);
    expect(kpi(v, "delay").value).toBeGreaterThanOrEqual(4); // B Elektro 2 + Estrich 2 (+ successors)
    expect(kpi(v, "claims")).toMatchObject({ value: 42000, note: "vorläufig" });
    for (const k of v.kpis) expect(k.spark).toHaveLength(14);
  });

  it("heatmap: B Elektro late, its Estrich waits, A on plan, C Fassade without data", () => {
    expect(cell(v, "B", "Elektro")).toMatchObject({ status: "amber", delay: 2 });
    expect(cell(v, "B", "Estrich")).toMatchObject({ status: "amber", delay: 2 });
    expect(cell(v, "B", "Estrich").reason).toMatch(/wartet auf Elektro 2\.OG/);
    expect(v.heatmap.rows.find((r) => r.code === "A")!.cells.every((c) => c.status === "green" || c.status === "none")).toBe(true);
    expect(cell(v, "C", "Fassade")).toMatchObject({ status: "amber", reason: "Keine Mengenmeldung seit 2 Arbeitstagen" });
    expect(v.heatmap.rows.find((r) => r.code === "C")!.cells.filter((c) => c.status === "amber")).toHaveLength(1);
    expect(v.heatmap.title).toBe("Elektro auf Baustelle B 2 Tage im Verzug");
  });

  it("mini schedule of B: forecast bars and the waiting Estrich", () => {
    expect(v.schedule.code).toBe("B");
    const estrich = v.schedule.rows.find((r) => r.trade === "Estrich" && r.area === "2.OG")!;
    expect(estrich).toMatchObject({ delay: 2, waits_for: "Elektro 2.OG" });
    expect(estrich.forecast_end > estrich.end).toBe(true);
  });

  it("reporting grid, pipeline, feed", () => {
    expect(v.completeness.rows.length).toBe(7);
    const haus = v.completeness.rows.find((r) => r.team === "Team Haustechnik")!;
    expect(haus.cells.at(-2)!.state).toBe("missing"); // yesterday
    expect(v.pipeline.steps.map((s) => s.count)).toEqual([0, 2, 4, 1, 9]);
    expect(v.feed.length).toBeGreaterThan(5);
    expect(new Set(v.feed.map((f) => f.source))).toEqual(new Set(["call", "email", "checkin", "system"])); // system = validated in the office
    expect(v.feed.filter((f) => f.href).every((f) => f.href!.startsWith("/admin/"))).toBe(true);
  });

  it("filters narrow every widget", () => {
    const b = dashboardFromSeed(seed, now, { project: IDS.project });
    expect(b.heatmap.rows.map((r) => r.code)).toEqual(["B"]);
    expect(kpi(b, "open").value).toBe(0);
    expect(kpi(b, "missing").value).toBe(2);
    const fassade = dashboardFromSeed(seed, now, { trade: "Fassade" });
    expect(fassade.heatmap.trades).toEqual(["Fassade"]);
    expect(fassade.trade_bars.bars.map((x) => x.trade)).toEqual(["Fassade"]);
    expect(kpi(fassade, "open").value).toBe(2); // KL-…-0038, -0040
    const seven = dashboardFromSeed(seed, now, { days: 7 });
    expect(seven.completeness.days).toHaveLength(7);
    expect(seven.kpis[0].spark).toHaveLength(7);
  });

  it("the call's hindrance on B Elektro: one more open case, the cell turns red", () => {
    const hindrance: Case = {
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
    const after = dashboardFromSeed({ ...seed, case: [...seed.case!, hindrance] }, now);
    expect(kpi(after, "open").value).toBe(7);
    expect(cell(after, "B", "Elektro")).toMatchObject({ status: "red", hindrance: { reference: "KL-2026-0042" } });
    expect(after.heatmap.title).toMatch(/^Elektro auf Baustelle B behindert \(KL-2026-0042\)/);
    const row = after.schedule.rows.find((r) => r.trade === "Estrich" && r.area === "2.OG")!;
    expect(row.hindrances[0]).toMatchObject({ reference: "KL-2026-0042", start: "2026-11-20" });
  });

  it("every seeded letter builds (real document versions)", () => {
    const versions = seed.document_version!;
    expect(versions.length).toBe(14);
    for (const x of versions) expect(x.body_md.length).toBeGreaterThan(200);
  });
});
