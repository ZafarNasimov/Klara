// What the dashboards need on top of the demo history (demo-history.ts), as
// the pitch tells it. Applied after withDemoHistory on "Demo zurücksetzen" and
// the memory store's first start; the test seed (buildSeed) stays as it is.
//
// B Wohnanlage Riem (the call site): Elektro 2.OG is one Werktag behind (gaps
// in its reports, the crew works faster than planned since); the Estrich
// 2.OG starts only after it, so it is on plan until a hindrance stops the
// Elektro. Trockenbau and Estrich 1.OG are on plan. A Schwabing: on plan.
// C Pasing: the Fassade has no quantities and no report for two days.
// Plan vs. Ist: Elektro 85/72, Sanitär 60/64, Trockenbau 45/40, Estrich 55/38.
// Plus daily reports per team for 16 Werktage (with gaps) and check-ins.
import { addCalendarDays, berlinDay, berlinTime, DEFAULT_HOLIDAY_REGION, isWerktag, subWerktage, addWerktage } from "@/lib/deadlines";
import { IDS, seedId } from "@/lib/ids";
import type { AppEvent, DailyReport, ProgressEntry, ScheduleItem, Team, Trade } from "@/lib/types";
import type { SeedData } from "./store";

/** Teams without a report on these Werktage (offsets; 0 = today). */
const MISSING: Record<string, number[]> = {
  [IDS.teamEstrich]: [0], // the call this morning is the team's first entry today
  [IDS.teamInnenausbau]: [0],
  [IDS.teamSchwFassade]: [0, -1, -2],
};

export function withDashboardHistory(seed: SeedData, now: Date): SeedData {
  const region = DEFAULT_HOLIDAY_REGION;
  const today = berlinDay(now);
  const wt = (n: number) => (n === 0 ? today : n > 0 ? addWerktage(today, n, region) : subWerktage(today, -n, region));
  const yesterday = wt(-1);
  let k = 0;
  const nid = () => seedId(500000 + ++k);
  const entries = (item: string, days: [number, number][]): ProgressEntry[] =>
    days.map(([d, qty]) => ({ id: nid(), schedule_item_id: item, date: wt(d), actual_qty: qty, note: null }));

  // ── Schedule ────────────────────────────────────────────────────────
  const patch: Record<string, Partial<ScheduleItem>> = {
    [IDS.schedElektro2]: { start_date: wt(-11), end_date: wt(1), planned_qty: 1300, unit: "m", planned_per_day: 100 },
    [IDS.schedEstrich2]: { start_date: wt(3), end_date: wt(7) },
    [IDS.schedTrockenbau2]: { start_date: wt(-5), end_date: wt(5), planned_qty: 330, unit: "m²", planned_per_day: 30 },
  };
  const item = (id: string, project_id: string, trade_id: string, activity: string, area: string, s: number, e: number, qty: number, unit: string, perDay: number): ScheduleItem => ({
    id, project_id, trade_id, activity, area, start_date: wt(s), end_date: wt(e), planned_qty: qty, unit, planned_per_day: perDay, depends_on: [],
  });
  const schedule: ScheduleItem[] = [
    ...(seed.schedule_item ?? []).map((s) => (patch[s.id] ? { ...s, ...patch[s.id] } : s)),
    item(IDS.schedEstrich1, IDS.project, IDS.tradeEstrich, "Zementestrich CT-C25-F4 auf Trennlage, 65 mm", "1.OG", -6, 4, 330, "m²", 30),
    item(IDS.schedRiemSanitaer, IDS.projectRiem, IDS.tradeRiemSanitaer, "Sanitär-Vorwandinstallation", "Bauteil B, 1.OG", -6, 3, 300, "Stk", 30),
    item(IDS.schedSchwFassade, IDS.projectSchwabing, IDS.tradeSchwFassade, "Fassadenanstrich Westseite", "Westseite", -6, 5, 600, "m²", 50),
  ];
  const trades: Trade[] = [
    ...(seed.trade ?? []),
    { id: IDS.tradeRiemSanitaer, project_id: IDS.projectRiem, name: "Sanitär", contracted_by: "us", contact_id: null, team_id: null },
    { id: IDS.tradeSchwFassade, project_id: IDS.projectSchwabing, name: "Fassade", contracted_by: "us", contact_id: null, team_id: IDS.teamSchwFassade },
  ];
  const teams: Team[] = [...(seed.team ?? []), { id: IDS.teamSchwFassade, project_id: IDS.projectSchwabing, name: "Team Fassade", lead_user_id: null }];

  // ── Quantities ──────────────────────────────────────────────────────
  const replaced = new Set([IDS.schedElektro2, IDS.schedEstrich2, IDS.schedTrockenbau2]);
  const progress: ProgressEntry[] = [
    ...(seed.progress_entry ?? [])
      .filter((p) => !replaced.has(p.schedule_item_id))
      // A Decke: a full day on -2 (on plan).
      .map((p) => (p.schedule_item_id === IDS.schedRiemDecke && p.date === wt(-2) ? { ...p, actual_qty: 32 } : p)),
    // B Elektro 2.OG: no reports in the first four days, since then above plan → 72 % of 1300 m, one Werktag late.
    ...entries(IDS.schedElektro2, [[-7, 128], [-6, 140], [-5, 132], [-4, 136], [-3, 130], [-2, 138], [-1, 132]]),
    // B Estrich 1.OG: three days reported, 38 %, on plan.
    ...entries(IDS.schedEstrich1, [[-3, 42], [-2, 41], [-1, 42]]),
    // B Trockenbau 2.OG: four days reported, 40 %, on plan.
    ...entries(IDS.schedTrockenbau2, [[-4, 33], [-3, 33], [-2, 33], [-1, 33]]),
    // A Sanitär: 64 % against 60 % planned.
    ...entries(IDS.schedRiemSanitaer, [[-6, 32], [-5, 31], [-4, 33], [-3, 32], [-2, 32], [-1, 32]]),
    // A Mauerwerk: the last 30 m² on -5 (done before the slab).
    ...((seed.progress_entry ?? []).filter((p) => p.schedule_item_id === IDS.schedRiemMauerwerk).reduce((n, p) => n + p.actual_qty, 0) < 310 ? entries(IDS.schedRiemMauerwerk, [[-5, 30]]) : []),
    // A WDVS: the first two days after the windows (the teammates' history starts on -2).
    ...((seed.progress_entry ?? []).some((p) => p.schedule_item_id === IDS.schedRiemWdvs && p.date === wt(-4)) ? [] : entries(IDS.schedRiemWdvs, [[-4, 40], [-3, 40]])),
    // C Fassade: four days, then nothing for two Werktage.
    ...entries(IDS.schedSchwFassade, [[-6, 50], [-5, 50], [-4, 50], [-3, 50]]),
  ];

  // ── Daily reports: every team with planned work, every Werktag, minus the gaps ──
  const reports: DailyReport[] = [...(seed.daily_report ?? [])];
  const have = new Set(reports.map((r) => `${r.team_id}|${r.date}`));
  const events: AppEvent[] = [];
  const first = subWerktage(today, 16, region);
  for (const team of teams) {
    const mine = new Set(trades.filter((t) => t.team_id === team.id).map((t) => t.id));
    const items = schedule.filter((s) => mine.has(s.trade_id));
    const gaps = new Set((MISSING[team.id] ?? []).map(wt));
    for (let d = first; d <= today; d = addCalendarDays(d, 1)) {
      if (!isWerktag(d, region) || gaps.has(d) || have.has(`${team.id}|${d}`)) continue;
      if (!items.some((s) => s.start_date <= d && d <= s.end_date)) continue;
      const isToday = d === today;
      const at = isToday ? new Date(Math.min(now.getTime() - 60_000, berlinTime(d, 7, 5).getTime())) : berlinTime(d, 16, 40);
      const text = isToday ? "Morgen-Check-in: Plan für heute bestätigt." : "Abend-Check-in: Tagesleistung gemeldet.";
      reports.push({ id: nid(), team_id: team.id, date: d, data: { entries: [{ kind: "note", text, at: at.toISOString(), by: null }] }, status: isToday ? "entwurf" : "eingereicht", missing_fields: [] });
      if (d >= yesterday) {
        events.push({ id: nid(), case_id: null, project_id: team.project_id, kind: "diary_entry", payload: { team_id: team.id, source: "checkin", text: `${team.name}: ${text}` }, created_at: at.toISOString() });
      }
    }
  }

  return { ...seed, team: teams, trade: trades, schedule_item: schedule, progress_entry: progress, daily_report: reports, event: [...(seed.event ?? []), ...events] };
}
