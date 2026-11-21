// Portfolio / project dashboard: every number computed from the rows (no
// hardcoded values). Pure and client-safe: the API computes it from the store,
// the pitch from the seed, with the same function.
import { addCalendarDays, isWerktag, weekday, werktageBetween } from "@/lib/deadlines";
import { docTitle } from "@/lib/doctypes";
import { CASE_STATUS_DE, EVENT_DE } from "@/lib/labels";
import type { AppEvent, Case, CaseStatus, DailyReport, DocumentVersion, ProgressEntry, Project, ScheduleItem, Team, Trade } from "@/lib/types";

// ── Input / output ──────────────────────────────────────────────────────

export type DashboardData = {
  projects: Project[];
  teams: Team[];
  trades: Trade[];
  schedule: ScheduleItem[];
  progress: ProgressEntry[];
  reports: DailyReport[];
  cases: Case[];
  versions: DocumentVersion[];
  events: AppEvent[];
};

export type Period = 7 | 14 | 30;
export const PERIODS: Period[] = [7, 14, 30];

export type DashboardFilters = { project: string | null; team: string | null; trade: string | null; days: Period };

export type Kpi = {
  key: "open" | "missing" | "sent" | "delay" | "claims";
  label: string;
  value: number;
  format: "int" | "eur";
  /** One value per day of the period, oldest first. */
  spark: number[];
  /** Change against the same point last week. */
  delta: number;
  delta_label: string;
  note: string | null;
  /** How it is computed (shown on hover). */
  basis: string;
};

export type CellStatus = "green" | "amber" | "red" | "none";
export type HeatCell = {
  trade: string;
  status: CellStatus;
  delay: number;
  reason: string;
  hindrance: { id: string; reference: string; since: string } | null;
};
export type HeatRow = { project_id: string; code: string; name: string; cells: HeatCell[] };

export type TradeBar = { trade: string; plan: number; actual: number; worst: boolean; items: number };

export type ScheduleRow = {
  id: string;
  trade: string;
  area: string;
  activity: string;
  start: string;
  end: string;
  forecast_end: string;
  delay: number;
  /** Waiting for a late predecessor (delay inherited). */
  waits_for: string | null;
  hindrances: { case_id: string; reference: string; start: string; end: string }[];
};
export type MiniSchedule = { project_id: string; code: string; name: string; from: string; to: string; today: string; rows: ScheduleRow[] };

export type CompletenessState = "report" | "missing" | "none";
export type CompletenessRow = { team_id: string; team: string; code: string; cells: { day: string; state: CompletenessState }[] };

export type PipelineStep = { status: "entwurf" | "unvollstaendig" | "bereit" | "validiert" | "versendet"; label: string; count: number };

export type FeedSource = "call" | "meeting" | "email" | "checkin" | "system";
export type FeedItem = { id: string; at: string; source: FeedSource; title: string; ref: string | null; detail: string | null; href: string | null; code: string | null };

/** One card in "Handlungsbedarf": the most severe first. */
export type ActionItem = {
  id: string;
  kind: "hindrance" | "delay" | "report" | "no_data" | "letter";
  status: Exclude<CellStatus, "none">;
  severity: number;
  /** One short line, e.g. "Elektro · Riem · Behinderung offen". */
  text: string;
  href: string;
  /** Tooltip: what it is based on. */
  detail: string;
};

/** A site on the map: worst status, open cases, forecast delay days. */
export type SiteSummary = { id: string; code: string; name: string; short: string; lat: number; lng: number; status: CellStatus; open: number; delay: number };

export type DashboardView = {
  now: string;
  today: string;
  filters: DashboardFilters;
  sites: { id: string; code: string; name: string }[];
  teams: { id: string; name: string; project_id: string; code: string }[];
  trade_names: string[];
  kpis: Kpi[];
  heatmap: { trades: string[]; rows: HeatRow[]; title: string };
  trade_bars: { bars: TradeBar[]; title: string };
  schedule: MiniSchedule & { title: string };
  completeness: { days: string[]; rows: CompletenessRow[]; title: string };
  pipeline: { steps: PipelineStep[]; title: string };
  feed: FeedItem[];
  actions: { items: ActionItem[]; ok: string[] };
  site_map: SiteSummary[];
};

/** Heatmap columns (in this order). */
export const HEAT_TRADES = ["Elektro", "Sanitär", "Trockenbau", "Estrich", "Rohbau", "Fassade"];

/** Open for the office: confirmed by the Polier, not yet validated or sent (drafts in a running call do not count yet). */
const OPEN_STATUSES = new Set<CaseStatus>(["unvollstaendig", "bereit"]);
const NOT_LETTERS = new Set(["bautagesbericht"]);

// ── Helpers ─────────────────────────────────────────────────────────────

const dayOf = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(iso));

function makeCalendar(region: string) {
  const memo = new Map<string, boolean>();
  const work = (d: string) => {
    let v = memo.get(d);
    if (v === undefined) memo.set(d, (v = isWerktag(d, region)));
    return v;
  };
  const prev = (d: string) => {
    let c = addCalendarDays(d, -1);
    while (!work(c)) c = addCalendarDays(c, -1);
    return c;
  };
  const add = (d: string, n: number) => {
    let c = d;
    for (let left = n; left > 0; ) {
      c = addCalendarDays(c, 1);
      if (work(c)) left--;
    }
    return c;
  };
  /** Werktage from a to b inclusive. */
  const count = (a: string, b: string) => {
    let n = 0;
    for (let c = a; c <= b; c = addCalendarDays(c, 1)) if (work(c)) n++;
    return n;
  };
  return { work, prev, add, count };
}
type Cal = ReturnType<typeof makeCalendar>;

const siteCode = (p: Project | undefined) => (p && typeof p.settings.site_code === "string" ? p.settings.site_code : "–");
/** "Riem", "Schwabing", "Pasing": the district in the site's name or address. */
const siteShort = (p: Project | undefined) =>
  (p && typeof p.settings.site_short === "string" ? p.settings.site_short : null) ?? p?.name.split(/[ ,]/).find((w) => /^(Riem|Schwabing|Pasing)$/.test(w)) ?? p?.name ?? "–";
const timeFmt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
/** "07:00" today, else "19.11." */
const fmtSince = (iso: string, today: string) => (dayOf(iso) === today ? timeFmt.format(new Date(iso)) : `${dayOf(iso).slice(8, 10)}.${dayOf(iso).slice(5, 7)}.`);

// ── Forecast per schedule item ──────────────────────────────────────────

export type ItemForecast = {
  item: ScheduleItem;
  trade: string;
  actual: number;
  plan_share: number;
  actual_share: number;
  finished: boolean;
  /** Active, but no quantities for the last two Werktage. */
  no_data: boolean;
  forecast_end: string;
  own_delay: number;
  delay: number;
  waits_for: string | null;
};

/**
* Delay forecast as of the end of `day`: remaining quantity / average actual
 * per reported Werktag (at least two reports), counted from the last report → forecast end; the Werktage
 * between the planned and the forecast end are the delay. An unfinished item
 * also inherits the delay of a late predecessor (depends_on).
 */
/** An active hindrance: the blocking trade on a site (and area) is stopped until `end`. */
export type ActiveHindrance = { case_id: string; reference: string; project_id: string; team_id: string | null; trade: string; area: string | null; start: string; start_at: string; end: string };

export function forecastItems(
  data: Pick<DashboardData, "schedule" | "progress" | "trades">,
  day: string,
  cal: Cal,
  hindrances: ActiveHindrance[] = [],
): Map<string, ItemForecast> {
  const tradeName = new Map(data.trades.map((t) => [t.id, t.name]));
  const byItem = new Map<string, ProgressEntry[]>();
  for (const p of data.progress) if (p.date <= day) (byItem.get(p.schedule_item_id) ?? byItem.set(p.schedule_item_id, []).get(p.schedule_item_id)!).push(p);
  const yesterday = cal.prev(day);
  const out = new Map<string, ItemForecast>();

  for (const it of data.schedule) {
    const entries = (byItem.get(it.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const qty = it.planned_qty ?? 0;
    const actual = entries.reduce((s, e) => s + e.actual_qty, 0);
    const total = cal.count(it.start_date, it.end_date) || 1;
    const finished = qty > 0 && actual >= qty;
    const started = it.start_date <= day;
    const last = entries.at(-1)?.date ?? null;
    const recent = entries.some((e) => e.date >= cal.prev(yesterday));
    // Only items planned with quantities are tracked; no report for two Werktage = missing data.
    const no_data = started && !finished && it.start_date < yesterday && qty > 0 && !recent;
    // Planned share up to yesterday; without recent quantities, up to the last report (like with like).
    const through = no_data && last ? last : yesterday;
    const planned = it.start_date > through ? 0 : Math.min(total, cal.count(it.start_date, through < it.end_date ? through : it.end_date));
    let forecast_end = it.end_date;
    let own = 0;
    if (qty && started && !finished) {
      // Rate per reported Werktag; a forecast needs at least two reports.
      if (last && actual > 0 && entries.length >= 2) {
        const avg = actual / entries.length;
        const needed = Math.ceil((qty - actual) / avg - 1e-9);
        forecast_end = cal.add(last, needed);
      } else if (day > it.end_date) {
        forecast_end = day; // overdue, no rate known: at least until today
      }
      // An active hindrance of this trade stops the work for its remaining Werktage.
      const trade = tradeName.get(it.trade_id);
      const stop = hindrances
        .filter((h) => h.project_id === it.project_id && h.trade === trade && sameFloor(h.area, it.area))
        .reduce((n, h) => Math.max(n, cal.count(day, h.end)), 0);
      if (stop) forecast_end = cal.add(forecast_end < day ? day : forecast_end, stop);
      own = forecast_end > it.end_date ? werktageBetween(it.end_date, forecast_end) : 0;
    }
    out.set(it.id, {
      item: it,
      trade: tradeName.get(it.trade_id) ?? "–",
      actual,
      plan_share: planned / total,
      actual_share: qty ? Math.min(1, actual / qty) : 0,
      finished,
      no_data,
      forecast_end,
      own_delay: own,
      delay: own,
      waits_for: null,
    });
  }
  // A predecessor still running when its successor should start pushes the
  // successor by the overlap (Werktage from the day before the start to the predecessor's forecast end).
  for (let pass = 0; pass < 3; pass++) {
    for (const f of out.values()) {
      if (f.finished) continue;
      for (const dep of f.item.depends_on) {
        const p = out.get(dep);
        // Only a late predecessor pushes, only by its own lateness, and only work that has not started yet.
        if (!p || p.delay <= 0 || p.forecast_end < f.item.start_date || f.actual > 0) continue;
        const shift = Math.min(p.delay, werktageBetween(cal.prev(f.item.start_date), p.forecast_end));
        if (shift > f.delay) {
          f.delay = shift;
          f.forecast_end = cal.add(f.item.end_date, shift);
          f.waits_for = `${p.trade} ${p.item.area}`;
        }
      }
    }
  }
  return out;
}

// ── Main ────────────────────────────────────────────────────────────────

export function computeDashboard(all: DashboardData, now: Date, filters: DashboardFilters, region: string, defaultSite: string | null): DashboardView {
  const cal = makeCalendar(region);
  const today = dayOf(now.toISOString());
  const days = filters.days;
  const period = Array.from({ length: days }, (_, i) => addCalendarDays(today, i - days + 1));

  // Filters → which projects, teams, trades, items, cases count.
  const team = filters.team ? all.teams.find((t) => t.id === filters.team) ?? null : null;
  const projectIds = new Set(
    all.projects.filter((p) => (!filters.project || p.id === filters.project) && (!team || team.project_id === p.id)).map((p) => p.id),
  );
  const trades = all.trades.filter(
    (t) => projectIds.has(t.project_id) && (!filters.trade || t.name === filters.trade) && (!team || t.team_id === team.id),
  );
  const tradeIds = new Set(trades.map((t) => t.id));
  const schedule = all.schedule.filter((s) => tradeIds.has(s.trade_id));
  const teams = all.teams.filter(
    (t) => projectIds.has(t.project_id) && (!team || t.id === team.id) && (!filters.trade || trades.some((x) => x.team_id === t.id)),
  );
  const caseTrade = (c: Case) => (typeof c.facts._trade === "string" ? c.facts._trade : null);
  const cases = all.cases.filter(
    (c) =>
      projectIds.has(c.project_id) &&
      !NOT_LETTERS.has(c.doc_type) &&
      (!team || c.team_id === team.id) &&
      (!filters.trade || caseTrade(c) === filters.trade),
  );
  const versionsByCase = new Map<string, DocumentVersion[]>();
  for (const v of all.versions) (versionsByCase.get(v.case_id) ?? versionsByCase.set(v.case_id, []).get(v.case_id)!).push(v);
  const project = (id: string) => all.projects.find((p) => p.id === id);
  const teamName = (id: string) => all.teams.find((t) => t.id === id)?.name ?? null;
  const data = { schedule, progress: all.progress, trades: all.trades };

  // ── KPI history ────────────────────────────────────────────────────
  const closedDay = (c: Case): string | null => {
    const stamps = (versionsByCase.get(c.id) ?? []).flatMap((v) => [v.validated_at, v.sent_at]).filter((x): x is string => !!x);
    if (stamps.length) return dayOf(stamps.sort()[0]);
    return OPEN_STATUSES.has(c.status) || c.status === "entwurf" ? null : dayOf(c.updated_at);
  };
  const openOn = (d: string) =>
    cases.filter((c) => {
      if (dayOf(c.created_at) > d || c.status === "entwurf") return false;
      const closed = closedDay(c);
      return d === today ? OPEN_STATUSES.has(c.status) : !closed || closed > d;
    }).length;

  const teamItems = (t: Team) => {
    const ids = new Set(all.trades.filter((x) => x.team_id === t.id && tradeIds.has(x.id)).map((x) => x.id));
    return schedule.filter((s) => ids.has(s.trade_id));
  };
  const reportSet = new Set(all.reports.map((r) => `${r.team_id}|${r.date}`));
  const activeOn = (t: Team, d: string) => cal.work(d) && teamItems(t).some((s) => s.start_date <= d && d <= s.end_date);
  const missingOn = (d: string) => teams.filter((t) => activeOn(t, d) && !reportSet.has(`${t.id}|${d}`));

  const sentOn = (d: string) => cases.reduce((n, c) => n + (versionsByCase.get(c.id) ?? []).filter((v) => v.sent_at && dayOf(v.sent_at) === d).length, 0);
  const monday = (d: string) => addCalendarDays(d, -((weekday(d) + 6) % 7));
  const sentBetween = (a: string, b: string) => {
    let n = 0;
    for (let d = a; d <= b; d = addCalendarDays(d, 1)) n += sentOn(d);
    return n;
  };

  // Hindrances active on a day: reported, not ended (Behinderung-Ende or closed), within the expected duration.
  const endNotice = new Map<string, string>();
  for (const c of all.cases) if (c.doc_type === "behinderung_ende" && c.parent_case_id && c.status !== "entwurf") endNotice.set(c.parent_case_id, dayOf(c.created_at));
  const hindrancesAt = (d: string): ActiveHindrance[] =>
    all.cases
      .filter((c) => c.doc_type === "behinderungsanzeige" && c.status !== "entwurf" && projectIds.has(c.project_id))
      .flatMap((c) => {
        const trade = caseTrade(c);
        const startAt = typeof c.facts.start_at === "string" ? c.facts.start_at : c.created_at;
        const start = dayOf(startAt);
        if (!trade || start > d || dayOf(c.created_at) > d) return [];
        if (c.status === "abgeschlossen" && dayOf(c.updated_at) <= d) return [];
        const ended = endNotice.get(c.id);
        if (ended && ended <= d) return [];
        const n = durationDays(c.facts.expected_duration);
        const end = n ? cal.add(start, n - 1) : d;
        if (end < d) return [];
        const area = typeof c.facts.area === "string" ? c.facts.area : null;
        return [{ case_id: c.id, reference: c.reference, project_id: c.project_id, team_id: c.team_id, trade, area, start, start_at: startAt, end }];
      });
  const activeNow = hindrancesAt(today);

  const cellDelays = (d: string) => {
    const f = forecastItems(data, d, cal, d === today ? activeNow : hindrancesAt(d));
    const cells = new Map<string, number>();
    for (const x of f.values()) {
      if (!x.item.planned_qty) continue; // only work planned with quantities is forecast
      const key = `${x.item.project_id}|${x.trade}`;
      cells.set(key, Math.max(cells.get(key) ?? 0, x.delay));
    }
    return { f, cells };
  };
  const delaySum = (d: string) => [...cellDelays(d).cells.values()].reduce((s, n) => s + n, 0);

  const estimates = (d: string) =>
    cases
      .filter((c) => c.doc_type === "mehrkostenanzeige" && c.status !== "entwurf" && dayOf(c.created_at) <= d && typeof c.facts.estimate_eur === "number")
      .reduce((s, c) => s + (c.facts.estimate_eur as number), 0);

  const weekAgo = addCalendarDays(today, -7);
  const fmtDelta = (n: number, unit = "") => (n === 0 ? "wie Vorwoche" : `${n > 0 ? "+" : "−"}${Math.abs(n).toLocaleString("de-DE")}${unit} ggü. Vorwoche`);

  const openNow = openOn(today);
  const missingToday = missingOn(today);
  const sentWeek = sentBetween(monday(today), today);
  const sentLastWeek = sentBetween(monday(weekAgo), weekAgo);
  const now$ = cellDelays(today);
  const delayNow = [...now$.cells.values()].reduce((s, n) => s + n, 0);
  const claimsNow = estimates(today);

  const kpis: Kpi[] = [
    {
      key: "open",
      label: "Offene Vorgänge",
      value: openNow,
      format: "int",
      spark: period.map(openOn),
      delta: openNow - openOn(weekAgo),
      delta_label: fmtDelta(openNow - openOn(weekAgo)),
      note: null,
      basis: "Vom Polier bestätigte Vorgänge, unvollständig oder bereit (noch nicht validiert oder versendet)",
    },
    {
      key: "missing",
      label: "Fehlende Tagesberichte heute",
      value: missingToday.length,
      format: "int",
      spark: period.map((d) => missingOn(d).length),
      delta: missingToday.length - missingOn(weekAgo).length,
      delta_label: fmtDelta(missingToday.length - missingOn(weekAgo).length),
      note: missingToday.length ? missingToday.map((t) => `${siteCode(project(t.project_id))} ${t.name.replace(/^Team\s+/, "")}`).join(", ") : null,
      basis: "Teams mit geplanter Arbeit heute laut Bauzeitenplan und ohne Tagesbericht",
    },
    {
      key: "sent",
      label: "Anzeigen diese Woche",
      value: sentWeek,
      format: "int",
      spark: period.map(sentOn),
      delta: sentWeek - sentLastWeek,
      delta_label: fmtDelta(sentWeek - sentLastWeek),
      note: null,
      basis: "Versendete Schreiben seit Montag (Versanddatum der Dokumentversion)",
    },
    {
      key: "delay",
      label: "Verzugstage im Risiko",
      value: delayNow,
      format: "int",
      spark: period.map(delaySum),
      delta: delayNow - delaySum(weekAgo),
      delta_label: fmtDelta(delayNow - delaySum(weekAgo)),
      note: null,
      basis: "Summe der prognostizierten Verzugstage je Baustelle und Gewerk: Restmenge ÷ Ist-Leistung pro Tag gegen das geplante Ende",
    },
    {
      key: "claims",
      label: "Dokumentierte Anspruchsgrundlage",
      value: claimsNow,
      format: "eur",
      spark: period.map(estimates),
      delta: claimsNow - estimates(weekAgo),
      delta_label: fmtDelta(claimsNow - estimates(weekAgo), " €"),
      note: "vorläufig",
      basis: "Summe der ersten Kosteneinschätzungen aus Mehrkostenanzeigen (netto, vorläufig)",
    },
  ];

  // ── Heatmap Baustelle × Gewerk ──────────────────────────────────────
  // Columns: trades planned with quantities, and any trade with an open hindrance; preferred order first.
  const tracked = new Set<string>([
    ...[...now$.f.values()].filter((x) => x.item.planned_qty && projectIds.has(x.item.project_id) && ((x.item.start_date <= today && !x.finished) || x.delay > 0)).map((x) => x.trade),
    ...activeNow.map((h) => h.trade),
  ]);
  const order = (t: string) => (HEAT_TRADES.includes(t) ? HEAT_TRADES.indexOf(t) : 100);
  const heatTrades = filters.trade ? [filters.trade] : [...tracked].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  const sites = all.projects
    .filter((p) => projectIds.has(p.id))
    .sort((a, b) => siteCode(a).localeCompare(siteCode(b)));
  const rows: HeatRow[] = sites.map((p) => ({
    project_id: p.id,
    code: siteCode(p),
    name: p.name,
    cells: heatTrades.map((trade) => {
      const all$ = [...now$.f.values()].filter((x) => x.item.project_id === p.id && x.trade === trade);
      // Work running today (started, not finished) planned with quantities.
      const items = all$.filter((x) => x.item.planned_qty && ((x.item.start_date <= today && !x.finished) || x.delay > 0));
      const hind = activeNow.find((h) => h.project_id === p.id && h.trade === trade);
      if (!items.length && !hind) return { trade, status: "none", delay: 0, reason: all$.length ? "Ohne Mengenplanung" : "Keine Arbeiten geplant", hindrance: null };
      const delay = Math.max(0, ...items.map((x) => x.delay));
      const noData = items.some((x) => x.no_data);
      const waits = items.find((x) => x.waits_for && x.delay > x.own_delay)?.waits_for;
      const status: CellStatus = hind || delay > 2 ? "red" : delay > 0 || noData ? "amber" : "green";
      const reason = hind
        ? `Offene Behinderung ${hind.reference}${delay ? `, Prognose +${delay} Arbeitstage` : ""}`
        : delay > 0
          ? `Prognose +${delay} ${delay === 1 ? "Arbeitstag" : "Arbeitstage"}${waits ? ` (wartet auf ${waits})` : ""}`
          : noData
            ? "Keine Mengenmeldung seit 2 Arbeitstagen"
            : "Im Plan";
      return { trade, status, delay, reason, hindrance: hind ? { id: hind.case_id, reference: hind.reference, since: hind.start_at } : null };
    }),
  }));
  const worstCell = rows
    .flatMap((r) => r.cells.map((c) => ({ r, c })))
    .filter(({ c }) => c.status !== "none")
    .sort((a, b) => rank(b.c) - rank(a.c))[0];
  const heatTitle = !worstCell || worstCell.c.status === "green"
    ? "Alle Gewerke im Plan"
    : worstCell.c.hindrance
      ? `${worstCell.c.trade} auf Baustelle ${worstCell.r.code} behindert (${worstCell.c.hindrance.reference})${worstCell.c.delay ? `, ${worstCell.c.delay} ${worstCell.c.delay === 1 ? "Tag" : "Tage"} im Verzug` : ""}`
      : worstCell.c.delay > 0
        ? `${worstCell.c.trade} auf Baustelle ${worstCell.r.code} ${worstCell.c.delay} ${worstCell.c.delay === 1 ? "Tag" : "Tage"} im Verzug`
        : `${worstCell.c.trade} auf Baustelle ${worstCell.r.code}: keine Meldung seit 2 Tagen`;

  // ── Plan vs. Ist je Gewerk ──────────────────────────────────────────
  const byTrade = new Map<string, { plan: number; actual: number; weight: number; items: number }>();
  for (const x of now$.f.values()) {
    // Work of the period: started by today and not finished before it began.
    if (!x.item.planned_qty || x.item.start_date > today || (x.finished && x.item.end_date < period[0])) continue;
    const w = cal.count(x.item.start_date, x.item.end_date) || 1;
    const b = byTrade.get(x.trade) ?? { plan: 0, actual: 0, weight: 0, items: 0 };
    b.plan += x.plan_share * w;
    b.actual += x.actual_share * w;
    b.weight += w;
    b.items++;
    byTrade.set(x.trade, b);
  }
  const bars: TradeBar[] = [...byTrade.entries()]
    .filter(([, b]) => !(b.plan >= b.weight - 1e-9 && b.actual >= b.weight - 1e-9)) // done: nothing to compare
    .map(([trade, b]) => ({ trade, plan: Math.round((b.plan / b.weight) * 100), actual: Math.round((b.actual / b.weight) * 100), worst: false, items: b.items }))
    .sort((a, b) => order(a.trade) - order(b.trade) || a.trade.localeCompare(b.trade));
  // Worst trade: most forecast delay days on any site, then the largest gap to plan.
  const tradeDelay = (t: string) => Math.max(0, ...[...now$.cells.entries()].filter(([k]) => k.endsWith(`|${t}`)).map(([, n]) => n));
  const worstBar = [...bars].sort((a, b) => tradeDelay(b.trade) - tradeDelay(a.trade) || b.plan - b.actual - (a.plan - a.actual))[0];
  if (worstBar && (tradeDelay(worstBar.trade) > 0 || worstBar.plan - worstBar.actual > 0)) worstBar.worst = true;
  const barsTitle = worstBar && worstBar.plan - worstBar.actual > 0
    ? `${worstBar.trade} ${worstBar.plan - worstBar.actual} ${worstBar.plan - worstBar.actual === 1 ? "Prozentpunkt" : "Prozentpunkte"} hinter Plan`
    : bars.length
      ? "Alle Gewerke auf oder über Plan"
      : "Keine Mengen geplant";

  // ── Mini-Bauablauf for one site ─────────────────────────────────────
  const siteId = filters.project ?? (team ? team.project_id : null) ?? (defaultSite && projectIds.has(defaultSite) ? defaultSite : sites[0]?.id ?? null);
  const site = siteId ? project(siteId) : undefined;
  const from = addCalendarDays(today, -days);
  const to = addCalendarDays(today, days);
  const schedRows: ScheduleRow[] = [...now$.f.values()]
    .filter((x) => x.item.project_id === siteId && x.item.end_date >= from && x.item.start_date <= to)
    .sort((a, b) => a.item.start_date.localeCompare(b.item.start_date) || a.trade.localeCompare(b.trade))
    .map((x) => ({
      id: x.item.id,
      trade: x.trade,
      area: x.item.area,
      activity: x.item.activity,
      start: x.item.start_date,
      end: x.item.end_date,
      forecast_end: x.forecast_end,
      delay: x.delay,
      waits_for: x.delay > x.own_delay ? x.waits_for : null,
      hindrances: [],
    }));
  // The red segment sits on the stopped (blocking) trade's row of that floor.
  for (const h of activeNow.filter((x) => x.project_id === siteId)) {
    const row =
      schedRows.find((r) => r.trade === h.trade && sameFloor(h.area, r.area) && r.start <= today && r.forecast_end >= today) ??
      schedRows.find((r) => r.trade === h.trade && sameFloor(h.area, r.area)) ??
      schedRows.find((r) => r.trade === h.trade);
    if (row) row.hindrances.push({ case_id: h.case_id, reference: h.reference, start: h.start, end: h.end });
  }
  const lateRow = [...schedRows].sort((a, b) => b.delay - a.delay)[0];
  const hindRow = schedRows.find((r) => r.hindrances.length);
  const schedTitle = hindRow
    ? `${hindRow.trade} ${hindRow.area} behindert (${hindRow.hindrances[0].reference})${hindRow.delay ? `, Prognose +${hindRow.delay} Tage` : ""}`
    : lateRow && lateRow.delay > 0
      ? `${lateRow.trade} ${lateRow.area}: Prognose +${lateRow.delay} ${lateRow.delay === 1 ? "Arbeitstag" : "Arbeitstage"}${lateRow.waits_for ? `, wartet auf ${lateRow.waits_for}` : ""}`
      : schedRows.length
        ? "Bauablauf im Plan"
        : "Keine Vorgänge im Zeitraum";

  // ── Berichtsvollständigkeit ────────────────────────────────────────
  const completeness: CompletenessRow[] = teams
    .filter((t) => period.some((d) => activeOn(t, d)))
    .sort((a, b) => siteCode(project(a.project_id)).localeCompare(siteCode(project(b.project_id))) || a.name.localeCompare(b.name))
    .map((t) => ({
      team_id: t.id,
      team: t.name,
      code: siteCode(project(t.project_id)),
      cells: period.map((d) => ({ day: d, state: !activeOn(t, d) ? "none" : reportSet.has(`${t.id}|${d}`) ? "report" : "missing" })),
    }));
  const missedPast = completeness.reduce((n, r) => n + r.cells.filter((c) => c.state === "missing" && c.day < today).length, 0);
  const complTitle = missingToday.length
    ? `${missingToday.length} ${missingToday.length === 1 ? "Team" : "Teams"} ohne Tagesbericht heute${missedPast ? `, ${missedPast} fehlende in ${days} Tagen` : ""}`
    : missedPast
      ? `${missedPast} fehlende Berichte in ${days} Tagen`
      : "Alle Teams haben berichtet";

  // ── Dokumenten-Pipeline ────────────────────────────────────────────
  const bucket = (s: CaseStatus): PipelineStep["status"] => (s === "beantwortet" || s === "abgeschlossen" ? "versendet" : (s as PipelineStep["status"]));
  const steps: PipelineStep[] = (["entwurf", "unvollstaendig", "bereit", "validiert", "versendet"] as const).map((s) => ({
    status: s,
    label: s === "versendet" ? "Versendet" : CASE_STATUS_DE[s],
    count: cases.filter((c) => bucket(c.status) === s).length,
  }));
  const waiting = steps.find((s) => s.status === "bereit")!.count + steps.find((s) => s.status === "unvollstaendig")!.count;
  const pipeTitle = waiting
    ? `${waiting} ${waiting === 1 ? "Schreiben wartet" : "Schreiben warten"} auf Prüfung oder Ergänzung`
    : cases.length
      ? "Keine Schreiben in Arbeit"
      : "Noch keine Schreiben";

  // ── Activity feed ─────────────────────────────────────────────────
  const caseById = new Map(all.cases.map((c) => [c.id, c]));
  const items: FeedItem[] = all.events
    .filter((e) => {
      if (!projectIds.has(e.project_id) || dayOf(e.created_at) < period[0]) return false;
      const c = e.case_id ? caseById.get(e.case_id) : undefined;
      const teamId = (c?.team_id ?? (typeof e.payload.team_id === "string" ? e.payload.team_id : null)) as string | null;
      if (team && teamId !== team.id) return false;
      if (filters.trade) {
        const tr = c ? caseTrade(c) : typeof e.payload.trade === "string" ? e.payload.trade : null;
        if (tr !== filters.trade) return false;
      }
      return !!feedTitle(e, undefined, null);
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 60)
    .map((e) => {
      const c = e.case_id ? caseById.get(e.case_id) : undefined;
      const meetingId = typeof e.payload.meeting_id === "string" ? e.payload.meeting_id : null;
      return {
        id: e.id,
        at: e.created_at,
        source: feedSource(e),
        title: feedTitle(e, c, c?.team_id ? teamName(c.team_id) : null)!,
        ref: c?.reference ?? (typeof e.payload.reference === "string" ? e.payload.reference : null),
        detail: feedDetail(e, c),
        href: c ? `/admin/case/${c.id}` : meetingId ? `/admin/meetings/${meetingId}` : null,
        code: siteCode(project(e.project_id)),
      };
    });

  const feed = groupCheckins(items).slice(0, 12);

  // ── Handlungsbedarf ─────────────────────────────────────────────────
  const short = (id: string) => siteShort(project(id));
  const cellOf = (pid: string, trade: string) => rows.find((r) => r.project_id === pid)?.cells.find((c) => c.trade === trade);
  const actions: ActionItem[] = [];
  for (const h of activeNow) {
    actions.push({ id: `h-${h.case_id}`, kind: "hindrance", status: "red", severity: 100, text: `${h.trade} · ${short(h.project_id)} · Behinderung offen`, href: `/admin/case/${h.case_id}`, detail: `Behinderung ${h.reference} seit ${fmtSince(h.start_at, today)}` });
  }
  for (const r of rows) {
    for (const c of r.cells) {
      if (c.hindrance || c.status === "none" || c.status === "green") continue;
      if (c.delay > 0) {
        actions.push({ id: `d-${r.project_id}-${c.trade}`, kind: "delay", status: c.status, severity: c.delay > 2 ? 90 : 70, text: `${c.trade} · ${short(r.project_id)} · +${c.delay} ${c.delay === 1 ? "Tag" : "Tage"}`, href: `/admin/vorgaenge?site=${r.project_id}&trade=${encodeURIComponent(c.trade)}`, detail: c.reason });
      }
    }
  }
  for (const t of missingToday) {
    const trade = all.trades.find((x) => x.team_id === t.id && tradeIds.has(x.id))?.name ?? t.name.replace(/^Team\s+/, "");
    actions.push({ id: `r-${t.id}`, kind: "report", status: "amber", severity: 60, text: `Bericht fehlt · ${trade} · ${short(t.project_id)}`, href: `/admin/vorgaenge?site=${t.project_id}`, detail: `${t.name}: heute geplante Arbeit, noch kein Tagesbericht` });
  }
  for (const r of rows) {
    for (const c of r.cells) {
      if (c.status !== "amber" || c.delay > 0 || c.hindrance) continue;
      if (actions.some((a) => a.kind === "report" && a.text.includes(`· ${c.trade} · ${short(r.project_id)}`))) continue;
      actions.push({ id: `n-${r.project_id}-${c.trade}`, kind: "no_data", status: "amber", severity: 55, text: `Keine Mengen · ${c.trade} · ${short(r.project_id)}`, href: `/admin/vorgaenge?site=${r.project_id}&trade=${encodeURIComponent(c.trade)}`, detail: c.reason });
    }
  }
  for (const c of cases.filter((x) => OPEN_STATUSES.has(x.status)).sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const text = c.doc_type === "mehrkostenanzeige" ? "Mehrkostenanzeige · vor Ausführung senden" : `${docTitle(c.doc_type)} · ${c.status === "bereit" ? "prüfen" : "ergänzen"}`;
    actions.push({ id: `l-${c.id}`, kind: "letter", status: "amber", severity: c.doc_type === "mehrkostenanzeige" ? 52 : 50, text, href: `/admin/case/${c.id}`, detail: `${c.reference} · ${short(c.project_id)}` });
  }
  actions.sort((a, b) => b.severity - a.severity || a.text.localeCompare(b.text));
  const ok = rows.flatMap((r) => r.cells.filter((c) => c.status === "green").map((c) => `${c.trade} · ${short(r.project_id)}`));

  // ── Map ─────────────────────────────────────────────────────────────
  const rankStatus = (st: CellStatus) => (st === "red" ? 3 : st === "amber" ? 2 : st === "green" ? 1 : 0);
  const siteMap: SiteSummary[] = sites.map((p) => {
    const cells = rows.find((r) => r.project_id === p.id)?.cells ?? [];
    const status = cells.reduce<CellStatus>((w, c) => (rankStatus(c.status) > rankStatus(w) ? c.status : w), "none");
    return {
      id: p.id,
      code: siteCode(p),
      name: p.name,
      short: siteShort(p),
      lat: p.lat,
      lng: p.lng,
      status: status === "none" ? "green" : status,
      open: cases.filter((c) => c.project_id === p.id && OPEN_STATUSES.has(c.status)).length,
      delay: [...now$.cells.entries()].filter(([k]) => k.startsWith(`${p.id}|`)).reduce((n, [, d]) => n + d, 0),
    };
  });
  void cellOf;

  return {
    now: now.toISOString(),
    today,
    filters,
    sites: all.projects.map((p) => ({ id: p.id, code: siteCode(p), name: p.name })).sort((a, b) => a.code.localeCompare(b.code)),
    teams: all.teams
      .filter((t) => !filters.project || t.project_id === filters.project)
      .map((t) => ({ id: t.id, name: t.name, project_id: t.project_id, code: siteCode(project(t.project_id)) }))
      .sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name)),
    trade_names: [...new Set([...HEAT_TRADES, ...all.trades.map((t) => t.name)])],
    kpis,
    heatmap: { trades: heatTrades, rows, title: heatTitle },
    trade_bars: { bars, title: barsTitle },
    schedule: { project_id: siteId ?? "", code: siteCode(site), name: site?.name ?? "", from, to, today, rows: schedRows, title: schedTitle },
    completeness: { days: period, rows: completeness, title: complTitle },
    pipeline: { steps, title: pipeTitle },
    feed,
    actions: { items: actions, ok },
    site_map: siteMap,
  };
}

/** Routine check-ins of the same half-day become one line ("4 Check-ins"). */
function groupCheckins(items: FeedItem[]): FeedItem[] {
  const out: FeedItem[] = [];
  const half = (iso: string) => `${dayOf(iso)}|${Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(new Date(iso))) < 12 ? "am" : "pm"}`;
  for (const f of items) {
    const prev = out.at(-1);
    if (f.source === "checkin" && prev?.source === "checkin" && !prev.href && !f.href && half(prev.at) === half(f.at)) {
      const n = Number(/^(\d+)/.exec(prev.title)?.[1] ?? 1) + 1;
      const who = (x: FeedItem) => `${(x.detail ?? "").split(":")[0]} (${x.code})`;
      prev.detail = n === 2 ? `${who(prev)}, ${who(f)}` : `${prev.detail}, ${who(f)}`;
      prev.title = `${n} Check-ins`;
      prev.code = prev.code === f.code ? prev.code : null;
      continue;
    }
    out.push({ ...f });
  }
  return out;
}

const NUMBER_WORDS: Record<string, number> = { ein: 1, eine: 1, einen: 1, einem: 1, zwei: 2, drei: 3, vier: 4, "fünf": 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, halb: 1 };
/** "ca. 2 Arbeitstage", "zwei Tage", "eine Woche" → Werktage; 0 = unknown. */
export function durationDays(v: unknown): number {
  const s = String(v ?? "").toLowerCase();
  const n = Number(/(\d+)/.exec(s)?.[1] ?? NUMBER_WORDS[/\b(ein|eine|einen|einem|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|halb)\b/.exec(s)?.[1] ?? ""] ?? 0);
  return /woche/.test(s) ? n * 6 : n;
}

const rank = (c: HeatCell) => (c.status === "red" ? 1000 : c.status === "amber" ? 100 : 0) + c.delay * 10 + (c.hindrance ? 5 : 0);
const normArea = (a: string) => a.replace(/\s+/g, "").toUpperCase();
/** "2.OG", "2. OG, Achsen A–C", "im 2. Obergeschoss" → the same floor; no floor named → matches. */
const floorOf = (a: string | null) => {
  const m = a ? /(\d+)\s*\.?\s*(OG|Obergeschoss)|\b(EG|Erdgeschoss|UG)\b/i.exec(a) : null;
  return m ? (m[1] ? `${m[1]}OG` : m[3].slice(0, 2).toUpperCase()) : null;
};
const sameFloor = (a: string | null, b: string | null) => {
  const fa = floorOf(a);
  const fb = floorOf(b);
  return !fa || !fb || fa === fb;
};

function feedSource(e: AppEvent): FeedSource {
  const src = typeof e.payload.source === "string" ? e.payload.source : "";
  if (src.startsWith("meeting:") || e.kind.startsWith("meeting_")) return "meeting";
  if (src === "email" || e.kind.startsWith("email_") || e.kind.startsWith("reply_")) return "email";
  if (src === "checkin" || e.kind === "diary_entry" || e.kind === "progress_recorded") return "checkin";
  if (src === "call" || e.kind === "case_created" || e.kind === "case_confirmed" || e.kind === "call_ended") return "call";
  return "system";
}

function feedTitle(e: AppEvent, c: Case | undefined, team: string | null): string | null {
  const docType = c?.doc_type ?? (typeof e.payload.doc_type === "string" ? e.payload.doc_type : null);
  const report = docType === "bautagesbericht";
  const doc = report ? `Tagesbericht${team ? ` ${team.replace(/^Team\s+/, "")}` : ""}` : docType ? docTitle(docType) : "Schreiben";
  switch (e.kind) {
    case "case_created":
      return `${doc} angelegt`;
    case "case_validated":
      return `${doc} validiert`;
    case "email_sent":
      return `${doc} versendet`;
    case "reply_received":
      return `Antwort zu ${doc}`;
    case "case_closed":
      return `${doc} abgeschlossen`;
    case "meeting_processed":
      return "Besprechung ausgewertet";
    case "meeting_case_created":
    case "meeting_case_updated":
    case "meeting_schedule":
    case "case_confirmed":
      return EVENT_DE[e.kind] ?? null;
    case "diary_entry":
      return "Check-in";
    case "progress_recorded":
      return EVENT_DE[e.kind] ?? null;
    default:
      return null;
  }
}

function feedDetail(e: AppEvent, c: Case | undefined): string | null {
  const p = e.payload;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return str(p.summary_de) ?? str(p.text) ?? (c ? str(c.facts.cause) ?? str(c.facts.description) ?? str(c.facts.instruction_text) ?? str(c.facts.defect) ?? str(c.facts.concern) : null);
}

/** Default filters from URL params (invalid values fall back). */
export function parseFilters(p: { get(name: string): string | null }, fixedProject?: string | null): DashboardFilters {
  const d = Number(p.get("days"));
  return {
    project: fixedProject ?? (p.get("site") || null),
    team: p.get("team") || null,
    trade: p.get("trade") || null,
    days: (PERIODS as number[]).includes(d) ? (d as Period) : 14,
  };
}
