import { describe, expect, it } from "vitest";
import {
  addWerktage,
  berlinDay,
  berlinTime,
  computeDeadline,
  deadlineView,
  isPublicHoliday,
  isWerktag,
  parseRule,
  serializeRule,
  subWerktage,
  werktageBetween,
  type DeadlineRule,
} from "./deadlines";

describe("Werktage (Mon–Sat without Bavarian holidays)", () => {
  it("counts Saturday as a Werktag, Sunday not", () => {
    expect(isWerktag("2026-11-20")).toBe(true); // Friday
    expect(isWerktag("2026-11-21")).toBe(true); // Saturday
    expect(isWerktag("2026-11-22")).toBe(false); // Sunday
  });

  it("excludes Bavarian public holidays (Munich: Catholic municipality)", () => {
    expect(isPublicHoliday("2026-01-06")).toBe(true); // Heilige Drei Könige
    expect(isPublicHoliday("2026-06-04")).toBe(true); // Fronleichnam
    expect(isPublicHoliday("2026-08-15")).toBe(true); // Mariä Himmelfahrt
    expect(isPublicHoliday("2026-11-01")).toBe(true); // Allerheiligen
    expect(isPublicHoliday("2026-10-31")).toBe(false); // Reformationstag: not in Bavaria
    expect(isPublicHoliday("2026-11-18")).toBe(false); // Buß- und Bettag: school holiday only
    expect(isWerktag("2026-12-24")).toBe(true); // Heiligabend
    expect(isWerktag("2026-12-25")).toBe(false);
    expect(isWerktag("2026-12-26")).toBe(false); // 2. Weihnachtstag (a Saturday)
  });

  it("Mariä Himmelfahrt is not a holiday in a Protestant municipality", () => {
    expect(isPublicHoliday("2026-08-15", "EVANG")).toBe(false);
  });

  it("adds Werktage, skipping Sundays and holidays", () => {
    expect(addWerktage("2026-11-20", 1)).toBe("2026-11-21"); // Fri → Sat
    expect(addWerktage("2026-11-21", 1)).toBe("2026-11-23"); // Sat → Mon
    // 12 Werktage from Fri 20.11.: Sa21 Mo23 Di24 Mi25 Do26 Fr27 Sa28 Mo30 Di1 Mi2 Do3 Fr4
    expect(addWerktage("2026-11-20", 12)).toBe("2026-12-04");
    // Christmas: Wed 23.12. + 3 → Thu 24, (Fri 25, Sat 26 holidays, Sun 27) Mon 28, Tue 29
    expect(addWerktage("2026-12-23", 3)).toBe("2026-12-29");
    // Easter 2026: Thu 02.04. + 2 → (Fri 03 Karfreitag) Sat 04, (Sun 05, Mon 06 Ostermontag) Tue 07
    expect(addWerktage("2026-04-02", 2)).toBe("2026-04-07");
  });

  it("subtracts Werktage", () => {
    expect(subWerktage("2026-11-23", 1)).toBe("2026-11-21"); // Mon → Sat
    expect(subWerktage("2026-12-28", 1)).toBe("2026-12-24"); // over Christmas
  });

  it("counts Werktage between two days", () => {
    expect(werktageBetween("2026-11-20", "2026-12-04")).toBe(12);
    expect(werktageBetween("2026-12-04", "2026-11-20")).toBe(0);
    expect(werktageBetween("2026-11-21", "2026-11-23")).toBe(1); // Sunday skipped
  });
});

describe("Berlin time", () => {
  it("maps instants to the Berlin calendar day", () => {
    expect(berlinDay(new Date("2026-11-20T23:30:00Z"))).toBe("2026-11-21"); // 00:30 CET
    expect(berlinDay(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01"); // 23:59 CEST
  });

  it("builds wall-clock instants across DST", () => {
    expect(berlinTime("2026-11-20", 7).toISOString()).toBe("2026-11-20T06:00:00.000Z");
    expect(berlinTime("2026-07-01", 7).toISOString()).toBe("2026-07-01T05:00:00.000Z");
    expect(berlinTime("2026-03-29", 12).toISOString()).toBe("2026-03-29T10:00:00.000Z"); // DST day
  });
});

describe("computeDeadline", () => {
  const eventAt = berlinTime("2026-11-20", 7);
  const at = (day: string, hh = 9) => berlinTime(day, hh);

  it("unverzüglich: due today on the event day", () => {
    const d = computeDeadline({ kind: "unverzueglich" }, { eventAt, now: at("2026-11-20") });
    expect(d.status).toBe("due_today");
    expect(d.label_de).toBe("unverzüglich – heute");
    expect(d.due_at).toBe(berlinTime("2026-11-20", 23, 59, 59).toISOString());
  });

  it("unverzüglich: next Werktag is still due (late), later overdue", () => {
    const next = computeDeadline({ kind: "unverzueglich" }, { eventAt, now: at("2026-11-21") });
    expect(next.status).toBe("due_today");
    expect(next.label_de).toBe("unverzüglich – seit 20.11.2026, heute senden");
    const later = computeDeadline({ kind: "unverzueglich" }, { eventAt, now: at("2026-11-23") });
    expect(later.status).toBe("overdue");
    expect(later.label_de).toBe("unverzüglich – seit 20.11.2026 überfällig");
  });

  it("unverzüglich over a weekend: Saturday event, Monday is the next Werktag", () => {
    const sat = berlinTime("2026-11-21", 8);
    expect(computeDeadline({ kind: "unverzueglich" }, { eventAt: sat, now: at("2026-11-23") }).status).toBe("due_today");
  });

  it("unverzüglich for an expected hindrance (event in the future)", () => {
    const d = computeDeadline({ kind: "unverzueglich" }, { eventAt: berlinTime("2026-11-24", 7), now: at("2026-11-20") });
    expect(d.status).toBe("ok");
    expect(d.label_de).toBe("unverzüglich – ab 24.11.2026");
  });

  it("before work start (Mehrkosten)", () => {
    const rule: DeadlineRule = { kind: "before_event", event: "work_start" };
    const ws = "2026-11-25";
    expect(computeDeadline(rule, { eventAt, now: at("2026-11-20"), workStart: ws })).toMatchObject({
      status: "ok",
      label_de: "vor Ausführungsbeginn (25.11.2026)",
    });
    expect(computeDeadline(rule, { eventAt, now: at("2026-11-25"), workStart: ws }).status).toBe("due_today");
    expect(computeDeadline(rule, { eventAt, now: at("2026-11-26"), workStart: ws }).status).toBe("overdue");
    expect(computeDeadline(rule, { eventAt, now: at("2026-11-20") }).label_de).toBe("vor Ausführungsbeginn – Beginn unbekannt");
    expect(computeDeadline(rule, { eventAt, now: at("2026-11-20"), workStart: ws, workStarted: true })).toMatchObject({
      status: "overdue",
      label_de: "vor Ausführungsbeginn – bereits begonnen",
    });
  });

  it("12 Werktage after completion", () => {
    const d = computeDeadline({ kind: "working_days_after", days: 12, from: "completion" }, { eventAt, now: at("2026-11-25") });
    expect(d).toMatchObject({ status: "ok", label_de: "12 Werktage – bis 04.12.2026" });
  });

  it("21 calendar days after invoice", () => {
    const d = computeDeadline({ kind: "calendar_days_after", days: 21, from: "invoice" }, { eventAt, now: at("2026-12-11") });
    expect(d).toMatchObject({ status: "due_today", label_de: "21 Tage – bis 11.12.2026" });
  });

  it("none", () => {
    expect(computeDeadline({ kind: "none" }, { eventAt, now: eventAt }).due_at).toBeNull();
  });
});

describe("stored rule and read-time view (demo clock)", () => {
  it("round-trips rules", () => {
    const rules: DeadlineRule[] = [
      { kind: "unverzueglich" },
      { kind: "before_event", event: "work_start" },
      { kind: "working_days_after", days: 3, from: "reply" },
      { kind: "calendar_days_after", days: 21, from: "invoice" },
      { kind: "none" },
    ];
    for (const r of rules) expect(parseRule(serializeRule(r))).toEqual(r);
  });

  it("recomputes the status of a stored unverzüglich deadline as the clock moves", () => {
    const stored = { deadline_rule: "unverzueglich", deadline_at: berlinTime("2026-11-20", 23, 59, 59).toISOString(), status: "bereit" };
    expect(deadlineView(stored, berlinTime("2026-11-20", 10))?.label_de).toBe("unverzüglich – heute");
    expect(deadlineView(stored, berlinTime("2026-11-21", 10))?.status).toBe("due_today");
    expect(deadlineView(stored, berlinTime("2026-11-23", 10))?.status).toBe("overdue");
  });

  it("shows sent cases as met", () => {
    const stored = { deadline_rule: "unverzueglich", deadline_at: berlinTime("2026-11-20", 23, 59, 59).toISOString(), status: "versendet" };
    expect(deadlineView(stored, berlinTime("2026-11-25", 10), undefined, berlinTime("2026-11-20", 11).toISOString())).toMatchObject({
      status: "ok",
      label_de: "versendet am 20.11.2026",
    });
  });

  it("no deadline for rule none", () => {
    expect(deadlineView({ deadline_rule: "none", deadline_at: null, status: "bereit" }, new Date())).toBeNull();
  });
});
