// What the dashboards need on top of the demo history (demo-history.ts):
// quantities for the Elektro 2.OG on the Bürogebäude (planned end passed, a
// day of work left → 2 Werktage late, the Estrich waits for it), daily
// reports per team for the last 16 Werktage with gaps, and check-in events.
// Applied after withDemoHistory on "Demo zurücksetzen" and the memory store's
// first start. Pure; ids are stable (seedId 500000+).
import { addCalendarDays, berlinDay, berlinTime, DEFAULT_HOLIDAY_REGION, isWerktag, subWerktage } from "@/lib/deadlines";
import { IDS, seedId } from "@/lib/ids";
import type { AppEvent, DailyReport, ProgressEntry, ScheduleItem } from "@/lib/types";
import type { SeedData } from "./store";

const WOBBLE = [1.06, 0.95, 1.02, 0.97, 1.0];

/** Teams without a report on these Werktage (offsets; 0 = today). */
const MISSING: Record<string, number[]> = {
  [IDS.teamEstrich]: [0], // the call this morning is the team's first entry today
  [IDS.teamFassade]: [0, -3, -4], // Riem: no quantities on the first two WDVS days either
  [IDS.teamInnenausbau]: [0],
};

export function withDashboardHistory(seed: SeedData, now: Date): SeedData {
  const region = DEFAULT_HOLIDAY_REGION;
  const today = berlinDay(now);
  const wt = (n: number) => (n >= 0 ? today : subWerktage(today, -n, region));
  const yesterday = subWerktage(today, 1, region);
  let k = 0;
  const nid = () => seedId(500000 + ++k);

  // Elektro 2.OG: 900 m of conduit at 100 m per Werktag, done at 85 % pace.
  const schedule: ScheduleItem[] = (seed.schedule_item ?? []).map((s) =>
    s.id === IDS.schedElektro2 && !s.planned_qty ? { ...s, planned_qty: 900, unit: "m", planned_per_day: 100 } : s,
  );
  const progress: ProgressEntry[] = [...(seed.progress_entry ?? [])];
  // Every started item planned with quantities but without reports gets its daily quantities.
  for (const it of schedule) {
    if (!it.planned_qty || !it.planned_per_day || it.start_date > yesterday || progress.some((p) => p.schedule_item_id === it.id)) continue;
    const pace = it.id === IDS.schedElektro2 ? 0.85 : 1.02;
    let cum = 0;
    let i = 0;
    for (let d = it.start_date; d <= yesterday; d = addCalendarDays(d, 1)) {
      if (!isWerktag(d, region)) continue;
      const q = Math.min(Math.round(it.planned_per_day * pace * WOBBLE[i++ % WOBBLE.length]), it.planned_qty - cum);
      if (q <= 0) break;
      cum += q;
      progress.push({ id: nid(), schedule_item_id: it.id, date: d, actual_qty: q, note: null });
    }
  }

  // Daily reports: every team with planned work, every Werktag, minus the gaps.
  const reports: DailyReport[] = [...(seed.daily_report ?? [])];
  const have = new Set(reports.map((r) => `${r.team_id}|${r.date}`));
  const events: AppEvent[] = [];
  const first = subWerktage(today, 16, region);
  for (const team of seed.team ?? []) {
    const trades = new Set((seed.trade ?? []).filter((t) => t.team_id === team.id).map((t) => t.id));
    const items = schedule.filter((s) => trades.has(s.trade_id));
    const gaps = new Set((MISSING[team.id] ?? []).map(wt));
    for (let d = first; d <= today; d = addCalendarDays(d, 1)) {
      if (!isWerktag(d, region) || gaps.has(d) || have.has(`${team.id}|${d}`)) continue;
      if (!items.some((s) => s.start_date <= d && d <= s.end_date)) continue;
      const isToday = d === today;
      const at = isToday ? new Date(Math.min(now.getTime() - 60_000, berlinTime(d, 7, 5).getTime())) : berlinTime(d, 16, 40);
      const text = isToday ? "Morgen-Check-in: Plan für heute bestätigt." : "Abend-Check-in: Tagesleistung gemeldet.";
      reports.push({
        id: nid(),
        team_id: team.id,
        date: d,
        data: { entries: [{ kind: "note", text, at: at.toISOString(), by: null }] },
        status: isToday ? "entwurf" : "eingereicht",
        missing_fields: [],
      });
      if (d >= yesterday) {
        events.push({ id: nid(), case_id: null, project_id: team.project_id, kind: "diary_entry", payload: { team_id: team.id, source: "checkin", text: `${team.name}: ${text}` }, created_at: at.toISOString() });
      }
    }
  }

  return { ...seed, schedule_item: schedule, progress_entry: progress, daily_report: reports, event: [...(seed.event ?? []), ...events] };
}
