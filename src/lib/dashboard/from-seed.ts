// The dashboard from the demo seed (no store): what "Demo zurücksetzen" loads,
// computed by the same function as /api/dashboard. Server-only (the demo
// history hashes letters with node:crypto); the pitch fetches it from
// /api/dashboard/demo, which needs no database.
import "server-only";
import { withDashboardHistory } from "@/lib/db/dashboard-history";
import { withDemoHistory } from "@/lib/db/demo-history";
import { buildSeed } from "@/lib/db/seed";
import type { SeedData } from "@/lib/db/store";
import { DEFAULT_HOLIDAY_REGION } from "@/lib/deadlines";
import { IDS } from "@/lib/ids";
import { computeDashboard, type DashboardData, type DashboardFilters, type DashboardView } from "./compute";

export function demoSeed(now: Date): SeedData {
  return withDashboardHistory(withDemoHistory(buildSeed(now), now), now);
}

export function dataFromSeed(seed: SeedData): DashboardData {
  return {
    projects: seed.project ?? [],
    teams: seed.team ?? [],
    trades: seed.trade ?? [],
    schedule: seed.schedule_item ?? [],
    progress: seed.progress_entry ?? [],
    reports: seed.daily_report ?? [],
    cases: seed.case ?? [],
    versions: seed.document_version ?? [],
    events: seed.event ?? [],
  };
}

export function dashboardFromSeed(seed: SeedData, now: Date, filters: Partial<DashboardFilters> = {}): DashboardView {
  return computeDashboard(dataFromSeed(seed), now, { project: null, team: null, trade: null, days: 14, ...filters }, DEFAULT_HOLIDAY_REGION, IDS.project);
}
