// The dashboard from the store (all sites), for /api/dashboard.
import "server-only";
import { store } from "@/lib/db";
import { DEFAULT_PROJECT_ID, holidayRegion, projectNow } from "@/lib/db/repo";
import { computeDashboard, type DashboardFilters, type DashboardView } from "./compute";

export async function loadDashboard(filters: DashboardFilters): Promise<DashboardView> {
  const s = store();
  const [projects, teams, trades, schedule, progress, reports, cases, versions, events, now] = await Promise.all([
    s.list("project"),
    s.list("team"),
    s.list("trade"),
    s.list("schedule_item"),
    s.list("progress_entry"),
    s.list("daily_report"),
    s.list("case"),
    s.list("document_version"),
    s.list("event", { order: { column: "created_at", ascending: false }, limit: 400 }),
    projectNow(DEFAULT_PROJECT_ID),
  ]);
  const region = holidayRegion(projects.find((p) => p.id === DEFAULT_PROJECT_ID) ?? projects[0]);
  return computeDashboard({ projects, teams, trades, schedule, progress, reports, cases, versions, events }, now, filters, region, DEFAULT_PROJECT_ID);
}
