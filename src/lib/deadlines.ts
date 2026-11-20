// Deadlines and Werktage (SPEC §5.1, §7).
// Werktage = Monday–Saturday, excluding Sundays and Bavarian public holidays.
// All calendar logic runs on the Europe/Berlin calendar day.
import Holidays from "date-holidays";

export const TZ = "Europe/Berlin";

export type DeadlineRule =
  | { kind: "unverzueglich" }
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

// ── Calendar helpers ──────────────────────────────────────────────────

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Berlin calendar day (YYYY-MM-DD) of an instant. */
export function berlinDay(at: Date): string {
  return dayFmt.format(at);
}

function parseDay(day: string): { y: number; m: number; d: number } {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d };
}

/** Day of week for a calendar day: 0 = Sunday … 6 = Saturday. */
function weekday(day: string): number {
  const { y, m, d } = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addCalendarDays(day: string, n: number): string {
  const { y, m, d } = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Offset of Berlin local time vs UTC in minutes at a given instant. */
function berlinOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Instant for a Berlin wall-clock time on a calendar day. */
export function berlinTime(day: string, hh: number, mm: number, ss = 0): Date {
  const { y, m, d } = parseDay(day);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  const offset = berlinOffsetMinutes(guess);
  const result = new Date(guess.getTime() - offset * 60000);
  // Re-check around DST switches.
  const offset2 = berlinOffsetMinutes(result);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2 * 60000);
}

export const endOfBerlinDay = (day: string) => berlinTime(day, 23, 59, 59);

// ── Holidays & Werktage ──────────────────────────────────────────────

const holidayCache = new Map<string, Holidays>();
function holidays(region: string): Holidays {
  let h = holidayCache.get(region);
  if (!h) {
    // Munich is predominantly Catholic, so Mariä Himmelfahrt (15.08.) is a holiday there.
    h = region ? new Holidays("DE", "BY", region) : new Holidays("DE", "BY");
    holidayCache.set(region, h);
  }
  return h;
}

export const DEFAULT_HOLIDAY_REGION = "KATH";

export function isPublicHoliday(day: string, region = DEFAULT_HOLIDAY_REGION): boolean {
  const res = holidays(region).isHoliday(berlinTime(day, 12, 0));
  return Array.isArray(res) && res.some((h) => h.type === "public");
}

/** Werktag: Monday–Saturday and not a Bavarian public holiday. */
export function isWerktag(day: string, region = DEFAULT_HOLIDAY_REGION): boolean {
  return weekday(day) !== 0 && !isPublicHoliday(day, region);
}

/** The n-th Werktag after `day` (n ≥ 1). The start day itself is not counted. */
export function addWerktage(day: string, n: number, region = DEFAULT_HOLIDAY_REGION): string {
  let cur = day;
  let left = n;
  while (left > 0) {
    cur = addCalendarDays(cur, 1);
    if (isWerktag(cur, region)) left--;
  }
  return cur;
}

export function nextWerktag(day: string, region = DEFAULT_HOLIDAY_REGION): string {
  return addWerktage(day, 1, region);
}

/** Number of Werktage strictly after `from` up to and including `to`. */
export function werktageBetween(from: string, to: string, region = DEFAULT_HOLIDAY_REGION): number {
  if (to <= from) return 0;
  let n = 0;
  for (let cur = addCalendarDays(from, 1); cur <= to; cur = addCalendarDays(cur, 1)) {
    if (isWerktag(cur, region)) n++;
  }
  return n;
}

// ── Deadlines ─────────────────────────────────────────────────────────

const fmtDay = (day: string) => {
  const { y, m, d } = parseDay(day);
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
};

function statusFor(dueDay: string, today: string): DeadlineStatus {
  if (today < dueDay) return "ok";
  if (today === dueDay) return "due_today";
  return "overdue";
}

export type DeadlineInput = {
  /** When the triggering event happened (e.g. hindrance start). */
  eventAt: Date;
  /** Current (demo) time. */
  now: Date;
  /** For before_event rules: planned work start (ISO date or datetime). */
  workStart?: string | null;
  holidayRegion?: string;
};

export function computeDeadline(rule: DeadlineRule, input: DeadlineInput): Deadline {
  const region = input.holidayRegion ?? DEFAULT_HOLIDAY_REGION;
  const today = berlinDay(input.now);
  const eventDay = berlinDay(input.eventAt);

  switch (rule.kind) {
    case "unverzueglich": {
      // Practice rule: the notice should go out the same day as the event.
      const status = statusFor(eventDay, today);
      const label_de =
        status === "overdue"
          ? `unverzüglich – seit ${fmtDay(eventDay)} fällig`
          : status === "due_today"
            ? "unverzüglich – heute"
            : `unverzüglich – ${fmtDay(eventDay)}`;
      return { due_at: endOfBerlinDay(eventDay).toISOString(), status, label_de };
    }
    case "before_event": {
      if (!input.workStart) {
        return { due_at: null, status: "due_today", label_de: "vor Ausführungsbeginn – Beginn unbekannt" };
      }
      const startDay = input.workStart.length > 10 ? berlinDay(new Date(input.workStart)) : input.workStart;
      // Must be received before work starts: due the day before the start.
      const dueDay = addCalendarDays(startDay, -1);
      let status: DeadlineStatus;
      let label_de: string;
      if (today < dueDay) {
        status = "ok";
        label_de = `vor Ausführungsbeginn (${fmtDay(startDay)})`;
      } else if (today <= startDay) {
        status = "due_today";
        label_de = today === startDay ? "vor Ausführungsbeginn – Beginn heute" : "vor Ausführungsbeginn – heute";
      } else {
        status = "overdue";
        label_de = `vor Ausführungsbeginn – Beginn ${fmtDay(startDay)} überschritten`;
      }
      return { due_at: endOfBerlinDay(dueDay).toISOString(), status, label_de };
    }
    case "working_days_after": {
      const dueDay = addWerktage(eventDay, rule.days, region);
      const status = statusFor(dueDay, today);
      return {
        due_at: endOfBerlinDay(dueDay).toISOString(),
        status,
        label_de: `${rule.days} Werktage – bis ${fmtDay(dueDay)}`,
      };
    }
    case "calendar_days_after": {
      const dueDay = addCalendarDays(eventDay, rule.days);
      const status = statusFor(dueDay, today);
      return {
        due_at: endOfBerlinDay(dueDay).toISOString(),
        status,
        label_de: `${rule.days} Tage – bis ${fmtDay(dueDay)}`,
      };
    }
    case "none":
      return { due_at: null, status: "ok", label_de: "keine Frist" };
  }
}

export function describeRule(rule: DeadlineRule): string {
  switch (rule.kind) {
    case "unverzueglich":
      return "unverzueglich";
    case "before_event":
      return `before_${rule.event}`;
    case "working_days_after":
      return `${rule.days}_werktage_after_${rule.from}`;
    case "calendar_days_after":
      return `${rule.days}_tage_after_${rule.from}`;
    case "none":
      return "none";
  }
}
