import { describe, expect, it } from "vitest";
import {
  addWerktage,
  berlinDay,
  berlinTime,
  computeDeadline,
  isPublicHoliday,
  isWerktag,
  werktageBetween,
} from "./deadlines";

describe("Werktage", () => {
  it("counts Saturday as Werktag and Sunday not", () => {
    expect(isWerktag("2026-11-21")).toBe(true); // Saturday
    expect(isWerktag("2026-11-22")).toBe(false); // Sunday
    expect(isWerktag("2026-11-23")).toBe(true); // Monday
  });

  it("excludes Bavarian public holidays", () => {
    expect(isPublicHoliday("2026-01-06")).toBe(true); // Heilige Drei Könige
    expect(isPublicHoliday("2026-06-04")).toBe(true); // Fronleichnam
    expect(isPublicHoliday("2026-11-01")).toBe(true); // Allerheiligen
    expect(isPublicHoliday("2026-08-15")).toBe(true); // Mariä Himmelfahrt (Munich, Catholic)
    expect(isPublicHoliday("2026-10-31")).toBe(false); // Reformationstag is not a holiday in Bavaria
    expect(isPublicHoliday("2026-11-18")).toBe(false); // Buß- und Bettag: school holiday only
    expect(isWerktag("2026-12-25")).toBe(false);
    expect(isWerktag("2026-12-24")).toBe(true); // Heiligabend is a Werktag
  });

  it("adds Werktage skipping Sundays and holidays", () => {
    // Fri 2026-11-20 + 1 → Sat 21.11.
    expect(addWerktage("2026-11-20", 1)).toBe("2026-11-21");
    // Sat 21.11. + 1 → Mon 23.11. (Sunday skipped)
    expect(addWerktage("2026-11-21", 1)).toBe("2026-11-23");
    // 12 Werktage from Fri 20.11.: Sa21 Mo23 Di24 Mi25 Do26 Fr27 Sa28 Mo30 Di1 Mi2 Do3 Fr4 → 04.12.
    expect(addWerktage("2026-11-20", 12)).toBe("2026-12-04");
    // Over Christmas: Wed 23.12. + 3 → Thu 24, (25/26 holidays, 27 Sunday) Mon 28, Tue 29
    expect(addWerktage("2026-12-23", 3)).toBe("2026-12-29");
    // Over Easter 2026: Thu 02.04. + 2 → Sat 04.04. (Karfreitag), then Tue 07.04. (Sun + Ostermontag)
    expect(addWerktage("2026-04-02", 2)).toBe("2026-04-07");
  });

  it("counts Werktage between two days", () => {
    expect(werktageBetween("2026-11-20", "2026-12-04")).toBe(12);
    expect(werktageBetween("2026-12-04", "2026-11-20")).toBe(0);
  });
});

describe("Berlin time helpers", () => {
  it("maps instants to the Berlin calendar day", () => {
    expect(berlinDay(new Date("2026-11-20T23:30:00Z"))).toBe("2026-11-21"); // 00:30 CET
    expect(berlinDay(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01"); // 23:59 CEST
  });

  it("builds Berlin wall-clock instants across DST", () => {
    expect(berlinTime("2026-11-20", 7, 0).toISOString()).toBe("2026-11-20T06:00:00.000Z");
    expect(berlinTime("2026-07-01", 7, 0).toISOString()).toBe("2026-07-01T05:00:00.000Z");
  });
});

describe("computeDeadline", () => {
  const eventAt = berlinTime("2026-11-20", 7, 0);

  it("unverzüglich: due today on the event day", () => {
    const d = computeDeadline({ kind: "unverzueglich" }, { eventAt, now: berlinTime("2026-11-20", 9, 0) });
    expect(d.status).toBe("due_today");
    expect(d.label_de).toBe("unverzüglich – heute");
    expect(d.due_at).toBe(berlinTime("2026-11-20", 23, 59, 59).toISOString());
  });

  it("unverzüglich: overdue the next day", () => {
    const d = computeDeadline({ kind: "unverzueglich" }, { eventAt, now: berlinTime("2026-11-21", 9, 0) });
    expect(d.status).toBe("overdue");
    expect(d.label_de).toContain("20.11.2026");
  });

  it("working days after: 12 Werktage", () => {
    const d = computeDeadline(
      { kind: "working_days_after", days: 12, from: "completion" },
      { eventAt, now: berlinTime("2026-11-25", 9, 0) },
    );
    expect(d.status).toBe("ok");
    expect(d.label_de).toBe("12 Werktage – bis 04.12.2026");
  });

  it("calendar days after: 21 days", () => {
    const d = computeDeadline(
      { kind: "calendar_days_after", days: 21, from: "invoice" },
      { eventAt, now: berlinTime("2026-12-11", 9, 0) },
    );
    expect(d.status).toBe("due_today");
    expect(d.label_de).toBe("21 Tage – bis 11.12.2026");
  });

  it("before work start", () => {
    const rule = { kind: "before_event", event: "work_start" } as const;
    expect(computeDeadline(rule, { eventAt, now: berlinTime("2026-11-20", 9, 0), workStart: "2026-11-25" }).status).toBe("ok");
    expect(computeDeadline(rule, { eventAt, now: berlinTime("2026-11-24", 9, 0), workStart: "2026-11-25" }).status).toBe("due_today");
    expect(computeDeadline(rule, { eventAt, now: berlinTime("2026-11-26", 9, 0), workStart: "2026-11-25" }).status).toBe("overdue");
    expect(computeDeadline(rule, { eventAt, now: berlinTime("2026-11-20", 9, 0) }).label_de).toContain("unbekannt");
  });

  it("none", () => {
    expect(computeDeadline({ kind: "none" }, { eventAt, now: eventAt }).due_at).toBeNull();
  });
});
