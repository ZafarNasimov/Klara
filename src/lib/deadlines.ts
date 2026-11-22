// Deadlines and Werktage (SPEC §5.1, §7).
// Werktage = Monday–Saturday, excluding Sundays and Bavarian public holidays.
// All calendar logic runs on the Europe/Berlin calendar day.
import Holidays from "date-holidays";

export const TZ = "Europe/Berlin";
/** Munich is a Catholic municipality: Mariä Himmelfahrt (15.08.) is a holiday there. */
export const DEFAULT_HOLIDAY_REGION = "KATH";

export type DeadlineRule =
  | { kind: "unverzueglich" } // green same day, yellow next working day, red later
  | { kind: "before_event"; event: "work_start" }
  | { kind: "working_days_after"; days: number; from: string }
  | { kind: "calendar_days_after"; days: number; from: string }
  | { kind: "none" };

export type DeadlineStatus = "ok" | "due_today" | "overdue";

export type Deadline = {
  due_at: string | null;
  status: DeadlineStatus;
  label_de: string;
};

// ── Calendar days (YYYY-MM-DD strings on the Berlin calendar) ─────────

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Berlin calendar day (YYYY-MM-DD) of an instant. */
export function berlinDay(at: Date): string {
  return dayFmt.format(at);
}

function parseDay(day: string): { y: number; m: number; d: number } {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(day: string): number {
  const { y, m, d } = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addCalendarDays(day: string, n: number): string {
  const { y, m, d } = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Offset of Berlin wall-clock time against UTC in minutes at an instant. */
let offsetFmt: Intl.DateTimeFormat | null = null;
function berlinOffsetMinutes(at: Date): number {
  offsetFmt ??= new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = offsetFmt.formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The instant of a Berlin wall-clock time on a calendar day (DST-safe). */
export function berlinTime(day: string, hh: number, mm = 0, ss = 0): Date {
  const { y, m, d } = parseDay(day);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  const offset = berlinOffsetMinutes(guess);
  const result = new Date(guess.getTime() - offset * 60000);
  const offset2 = berlinOffsetMinutes(result);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2 * 60000);
}

export const endOfBerlinDay = (day: string) => berlinTime(day, 23, 59, 59);

/** "20.11.2026" */
export function fmtDayDe(day: string): string {
  const { y, m, d } = parseDay(day);
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

// ── Holidays & Werktage ──────────────────────────────────────────────

const holidayCache = new Map<string, Holidays>();
function calendar(region: string): Holidays {
  let h = holidayCache.get(region);
  if (!h) {
    h = region ? new Holidays("DE", "BY", region) : new Holidays("DE", "BY");
    holidayCache.set(region, h);
  }
  return h;
}

const publicHolidayMemo = new Map<string, boolean>();
/** Cached per day and region: date-holidays is slow, and the dashboard asks about the same days thousands of times. */
export function isPublicHoliday(day: string, region = DEFAULT_HOLIDAY_REGION): boolean {
  const key = `${region}|${day}`;
  let v = publicHolidayMemo.get(key);
  if (v === undefined) {
    const res = calendar(region).isHoliday(berlinTime(day, 12));
    v = Array.isArray(res) && res.some((h) => h.type === "public");
    if (publicHolidayMemo.size > 20_000) publicHolidayMemo.clear();
    publicHolidayMemo.set(key, v);
  }
  return v;
}

/** Werktag: Monday–Saturday and not a Bavarian public holiday. */
export function isWerktag(day: string, region = DEFAULT_HOLIDAY_REGION): boolean {
  return weekday(day) !== 0 && !isPublicHoliday(day, region);
}

/** The n-th Werktag after `day` (the start day itself is not counted). */
export function addWerktage(day: string, n: number, region = DEFAULT_HOLIDAY_REGION): string {
  let cur = day;
  let left = n;
  while (left > 0) {
    cur = addCalendarDays(cur, 1);
    if (isWerktag(cur, region)) left--;
  }
  return cur;
}

/** The n-th Werktag before `day`. */
export function subWerktage(day: string, n: number, region = DEFAULT_HOLIDAY_REGION): string {
  let cur = day;
  let left = n;
  while (left > 0) {
    cur = addCalendarDays(cur, -1);
    if (isWerktag(cur, region)) left--;
  }
  return cur;
}

export const nextWerktag = (day: string, region = DEFAULT_HOLIDAY_REGION) => addWerktage(day, 1, region);

/**
 * The demo's working day: today, or the next Werktag on a Sunday or holiday,
 * so seeded schedules ("ends in 2 Werktagen", "yesterday's report") read the
 * same whatever day the demo is reset on.
 */
export const demoDay = (now: Date, region = DEFAULT_HOLIDAY_REGION) => {
  const day = berlinDay(now);
  return isWerktag(day, region) ? day : nextWerktag(day, region);
};

/** Werktage strictly after `from`, up to and including `to`. */
export function werktageBetween(from: string, to: string, region = DEFAULT_HOLIDAY_REGION): number {
  let n = 0;
  for (let cur = addCalendarDays(from, 1); cur <= to; cur = addCalendarDays(cur, 1)) {
    if (isWerktag(cur, region)) n++;
  }
  return n;
}

// ── Deadlines ─────────────────────────────────────────────────────────

export type DeadlineInput = {
  /** When the triggering event happened (hindrance start, instruction …). */
  eventAt: Date;
  /** Current time (demo clock). */
  now: Date;
  /** before_event: planned work start (YYYY-MM-DD or ISO datetime). */
  workStart?: string | null;
  /** before_event: the user said the work has already started. */
  workStarted?: boolean | null;
  holidayRegion?: string;
};

function byDay(dueDay: string, today: string): DeadlineStatus {
  if (today < dueDay) return "ok";
  if (today === dueDay) return "due_today";
  return "overdue";
}

function toDay(v: string): string {
  return v.length > 10 ? berlinDay(new Date(v)) : v;
}

/** Unverzüglich: same day = due today; next Werktag = still due today (late); later = overdue. */
function unverzueglich(eventDay: string, today: string, region: string): Omit<Deadline, "due_at"> {
  if (today < eventDay) return { status: "ok", label_de: `unverzüglich – ab ${fmtDayDe(eventDay)}` };
  if (today === eventDay) return { status: "due_today", label_de: "unverzüglich – heute" };
  if (today <= nextWerktag(eventDay, region)) {
    return { status: "due_today", label_de: `unverzüglich – seit ${fmtDayDe(eventDay)}, heute senden` };
  }
  return { status: "overdue", label_de: `unverzüglich – seit ${fmtDayDe(eventDay)} überfällig` };
}

export function computeDeadline(rule: DeadlineRule, input: DeadlineInput): Deadline {
  const region = input.holidayRegion ?? DEFAULT_HOLIDAY_REGION;
  const today = berlinDay(input.now);
  const eventDay = berlinDay(input.eventAt);

  switch (rule.kind) {
    case "unverzueglich":
      return { due_at: endOfBerlinDay(eventDay).toISOString(), ...unverzueglich(eventDay, today, region) };

    case "before_event": {
      if (input.workStarted === true) {
        const due_at = input.workStart ? berlinTime(toDay(input.workStart), 7).toISOString() : null;
        return { due_at, status: "overdue", label_de: "vor Ausführungsbeginn – bereits begonnen" };
      }
      if (!input.workStart) return { due_at: null, status: "due_today", label_de: "vor Ausführungsbeginn – Beginn unbekannt" };
      const startDay = toDay(input.workStart);
      const status = byDay(startDay, today);
      const label_de =
        status === "ok"
          ? `vor Ausführungsbeginn (${fmtDayDe(startDay)})`
          : status === "due_today"
            ? "vor Ausführungsbeginn – Beginn heute"
            : `vor Ausführungsbeginn – Beginn ${fmtDayDe(startDay)} überschritten`;
      // Work usually starts at 07:00.
      return { due_at: berlinTime(startDay, 7).toISOString(), status, label_de };
    }

    case "working_days_after": {
      const dueDay = addWerktage(eventDay, rule.days, region);
      return {
        due_at: endOfBerlinDay(dueDay).toISOString(),
        status: byDay(dueDay, today),
        label_de: `${daysDe(rule.days, "Werktag")} – bis ${fmtDayDe(dueDay)}`,
      };
    }

    case "calendar_days_after": {
      const dueDay = addCalendarDays(eventDay, rule.days);
      return {
        due_at: endOfBerlinDay(dueDay).toISOString(),
        status: byDay(dueDay, today),
        label_de: `${daysDe(rule.days, "Tag")} – bis ${fmtDayDe(dueDay)}`,
      };
    }

    case "none":
      return { due_at: null, status: "ok", label_de: "keine Frist" };
  }
}

/** "1 Tag", "3 Tage", "1 Werktag", "5 Werktage". */
const daysDe = (n: number, unit: "Tag" | "Werktag") => `${n} ${unit}${n === 1 ? "" : "e"}`;

// The case row stores the rule as a short string next to deadline_at, so the
// status can be recomputed at read time against the (demo) clock.

export function serializeRule(rule: DeadlineRule): string {
  switch (rule.kind) {
    case "unverzueglich":
    case "none":
      return rule.kind;
    case "before_event":
      return `before_event:${rule.event}`;
    case "working_days_after":
    case "calendar_days_after":
      return `${rule.kind}:${rule.days}:${rule.from}`;
  }
}

export function parseRule(s: string | null | undefined): DeadlineRule {
  if (!s) return { kind: "none" };
  const [kind, a, b] = s.split(":");
  switch (kind) {
    case "unverzueglich":
      return { kind };
    case "before_event":
      return { kind, event: "work_start" };
    case "working_days_after":
    case "calendar_days_after":
      return { kind, days: Number(a), from: b ?? "" };
    default:
      return { kind: "none" };
  }
}

const SENT = new Set(["versendet", "beantwortet", "abgeschlossen"]);

/**
 * Display view of a stored deadline, recomputed for `now`.
 * Returns null for cases without a deadline.
 */
export function deadlineView(
  c: { deadline_rule: string | null; deadline_at: string | null; status: string; facts?: Record<string, unknown> },
  now: Date,
  region = DEFAULT_HOLIDAY_REGION,
  sentAt?: string | null,
): Deadline | null {
  const rule = parseRule(c.deadline_rule);
  if (rule.kind === "none") return null;
  if (SENT.has(c.status)) {
    return {
      due_at: c.deadline_at,
      status: "ok",
      label_de: sentAt ? `versendet am ${fmtDayDe(berlinDay(new Date(sentAt)))}` : "versendet",
    };
  }
  if (!c.deadline_at) {
    return rule.kind === "before_event"
      ? { due_at: null, status: "due_today", label_de: "vor Ausführungsbeginn – Beginn unbekannt" }
      : { due_at: null, status: "due_today", label_de: "Frist offen" };
  }
  const dueDay = berlinDay(new Date(c.deadline_at));
  const today = berlinDay(now);
  switch (rule.kind) {
    case "unverzueglich":
      return { due_at: c.deadline_at, ...unverzueglich(dueDay, today, region) };
    case "before_event":
      return computeDeadline(rule, {
        eventAt: now,
        now,
        workStart: dueDay,
        workStarted: c.facts?.work_started === true,
        holidayRegion: region,
      });
    case "working_days_after":
      return { due_at: c.deadline_at, status: byDay(dueDay, today), label_de: `${daysDe(rule.days, "Werktag")} – bis ${fmtDayDe(dueDay)}` };
    case "calendar_days_after":
      return { due_at: c.deadline_at, status: byDay(dueDay, today), label_de: `${daysDe(rule.days, "Tag")} – bis ${fmtDayDe(dueDay)}` };
  }
}
