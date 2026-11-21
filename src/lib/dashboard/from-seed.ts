// The dashboard from seed rows (no store): the pitch renders this offline.
import type { SeedData } from "@/lib/db/store";
import { IDS } from "@/lib/ids";
import { DEFAULT_HOLIDAY_REGION } from "@/lib/deadlines";
import { computeDashboard, type DashboardData, type DashboardFilters, type DashboardView } from "./compute";

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
