// Portfolio seed: Baustellen A (Schwabing) and C (Pasing) next to the app's
// project B (Wohnanlage Riem), and 14 Werktage of history for all three:
// progress per schedule item, daily reports per team, letters with their
// sent/validated dates, and timeline events. Pure (no I/O), so the pitch can
// compute the same dashboard from it offline.
//
// The story it tells (dashboard): B Elektro 2. OG is 2 Werktage behind and the
// Estrich that waits for it inherits the delay; one B team missed yesterday's
// report; A is on plan; C Fassade has no quantities for two days (missing data).
// B has no cases: the golden-path call creates KL-2026-0042 (the next number).
import { addCalendarDays, berlinTime, isWerktag, subWerktage, weekday } from "@/lib/deadlines";
import { buildBody, toMarkdown } from "@/lib/documents/build";
import { docTitle } from "@/lib/doctypes";
import { IDS, seedId } from "@/lib/ids";
import type { AppEvent, Case, CaseStatus, Contact, DailyReport, DocumentVersion, ProgressEntry, Project, ScheduleItem, Team, Trade } from "@/lib/types";
import type { SeedData } from "./store";

type Wt = (n: number) => string;

/** How each schedule item progressed (not stored): share of the planned daily rate, days without a report. */
type Pace = { factor: number; skip?: number[] };

export const SITE_CODES: Record<string, string> = { [IDS.projectA]: "A", [IDS.project]: "B", [IDS.projectC]: "C" };

const WOBBLE = [1.06, 0.95, 1.02, 0.97, 1.0];

// ── Sites A and C ────────────────────────────────────────────────────────

function siteA(region: string, settings: Project["settings"]) {
  const project: Project = {
    id: IDS.projectA,
    company_id: IDS.company,
    name: "Neubau Bürogebäude Schwabing",
    address: "Leopoldstraße 210, 80807 München",
    lat: 48.1705,
    lng: 11.586,
    contract_type: "VOB_B",
    contract_no: "BS-2026-031",
    contract_date: "2026-02-16",
    settings: { ...settings, holiday_region: region, site_code: "A" },
  };
  const contacts: Contact[] = [
    {
      id: IDS.contactBauherrA,
      project_id: IDS.projectA,
      name: "Dr. Michael Brandl",
      organisation: "Schwabing Office Campus GmbH",
      role: "bauherr",
      email: "m.brandl@schwabing-office.example",
      has_authority: true,
      address: "Ungererstraße 40, 80805 München",
    },
  ];
  const teams: Team[] = [
    { id: IDS.teamRohbauA, project_id: IDS.projectA, name: "Team Rohbau", lead_user_id: null },
    { id: IDS.teamAusbauA, project_id: IDS.projectA, name: "Team Ausbau", lead_user_id: null },
  ];
  const trades: Trade[] = [
    { id: IDS.tradeRohbauA, project_id: IDS.projectA, name: "Rohbau", contracted_by: "us", contact_id: null, team_id: IDS.teamRohbauA },
    { id: IDS.tradeTrockenbauA, project_id: IDS.projectA, name: "Trockenbau", contracted_by: "us", contact_id: null, team_id: IDS.teamAusbauA },
    { id: IDS.tradeElektroA, project_id: IDS.projectA, name: "Elektro", contracted_by: "us", contact_id: null, team_id: null },
    { id: IDS.tradeSanitaerA, project_id: IDS.projectA, name: "Sanitär", contracted_by: "us", contact_id: null, team_id: null },
  ];
  return { project, contacts, teams, trades };
}

function siteC(region: string, settings: Project["settings"]) {
  const project: Project = {
    id: IDS.projectC,
    company_id: IDS.company,
    name: "Schule Pasing",
    address: "Am Knie 6, 81241 München",
    lat: 48.1452,
    lng: 11.4612,
    contract_type: "VOB_B",
    contract_no: "SP-2026-008",
    contract_date: "2026-01-12",
    settings: { ...settings, holiday_region: region, site_code: "C" },
  };
  const contacts: Contact[] = [
    {
      id: IDS.contactBauherrC,
      project_id: IDS.projectC,
      name: "Sabine Köhler",
      organisation: "Bildungsbau München GmbH",
      role: "bauherr",
      email: "s.koehler@bildungsbau-muenchen.example",
      has_authority: true,
      address: "Bayerstraße 28, 80335 München",
    },
  ];
  const teams: Team[] = [
    { id: IDS.teamRohbauC, project_id: IDS.projectC, name: "Team Rohbau", lead_user_id: null },
    { id: IDS.teamFassadeC, project_id: IDS.projectC, name: "Team Fassade", lead_user_id: null },
  ];
  const trades: Trade[] = [
    { id: IDS.tradeRohbauC, project_id: IDS.projectC, name: "Rohbau", contracted_by: "us", contact_id: null, team_id: IDS.teamRohbauC },
    { id: IDS.tradeFassadeC, project_id: IDS.projectC, name: "Fassade", contracted_by: "us", contact_id: null, team_id: IDS.teamFassadeC },
    { id: IDS.tradeSanitaerC, project_id: IDS.projectC, name: "Sanitär", contracted_by: "us", contact_id: null, team_id: null },
    { id: IDS.tradeElektroC, project_id: IDS.projectC, name: "Elektro", contracted_by: "us", contact_id: null, team_id: null },
  ];
  return { project, contacts, teams, trades };
}

const item = (
  id: string,
  project_id: string,
  trade_id: string,
  activity: string,
  area: string,
  start: string,
  end: string,
  qty: number,
  unit: string,
  wt: Wt,
  startN: number,
  endN: number,
  depends_on: string[] = [],
): ScheduleItem => ({
  id,
  project_id,
  trade_id,
  activity,
  area,
  start_date: start,
  end_date: end,
  planned_qty: qty,
  unit,
  // Planned rate over the Werktage from start to end (inclusive).
  planned_per_day: Math.round((qty / (endN - startN + 1)) * 10) / 10,
  depends_on,
});

/** Schedule items of A and C, and how they progressed. */
function portfolioSchedule(wt: Wt): { items: ScheduleItem[]; pace: Record<string, Pace> } {
  const S = (id: string, p: string, t: string, a: string, area: string, s: number, e: number, q: number, unit: string) => item(id, p, t, a, area, wt(s), wt(e), q, unit, wt, s, e);
  const items = [
    S(IDS.schedRohbauA, IDS.projectA, IDS.tradeRohbauA, "Stahlbetondecke über 4. OG", "4.OG", -9, 4, 640, "m²"),
    S(IDS.schedTrockenbauA, IDS.projectA, IDS.tradeTrockenbauA, "Metallständerwände und Vorsatzschalen", "2.OG", -10, 2, 420, "m²"),
    S(IDS.schedElektroA, IDS.projectA, IDS.tradeElektroA, "Elektro-Rohinstallation", "1.OG", -11, 2, 900, "m"),
    S(IDS.schedSanitaerA, IDS.projectA, IDS.tradeSanitaerA, "Vorwandinstallation Sanitär", "1.OG", -8, 5, 48, "Stk"),
    S(IDS.schedRohbauC, IDS.projectC, IDS.tradeRohbauC, "Treppenhauskern Bauteil B", "EG–2.OG", -10, 3, 180, "m³"),
    S(IDS.schedFassadeC, IDS.projectC, IDS.tradeFassadeC, "WDVS Nordfassade", "Nord", -8, 6, 1200, "m²"),
    S(IDS.schedSanitaerC, IDS.projectC, IDS.tradeSanitaerC, "Grundleitungen", "EG", -6, 2, 220, "m"),
    S(IDS.schedElektroC, IDS.projectC, IDS.tradeElektroC, "Elektro-Rohinstallation", "EG", -5, 7, 1100, "m"),
  ];
  const pace: Record<string, Pace> = {
    [IDS.schedRohbauA]: { factor: 1.02 },
    [IDS.schedTrockenbauA]: { factor: 0.97 },
    [IDS.schedElektroA]: { factor: 1.0 },
    [IDS.schedSanitaerA]: { factor: 1.08 },
    [IDS.schedRohbauC]: { factor: 1.0 },
    [IDS.schedFassadeC]: { factor: 1.0, skip: [-1, -2] }, // no quantities for two days
    [IDS.schedSanitaerC]: { factor: 1.05 },
    [IDS.schedElektroC]: { factor: 1.0 },
  };
  return { items, pace };
}

/** How B's items progressed. B's schedule itself lives in seed.ts. */
export const B_PACE: Record<string, Pace> = {
  [IDS.schedElektro2]: { factor: 0.79 }, // planned end passed; ~2 Werktage of work left → the Estrich waits
  [IDS.schedEstrich1]: { factor: 1.0 },
  [IDS.schedTrockenbau2]: { factor: 0.95 },
  [IDS.schedSanitaer3]: { factor: 1.1 },
  [IDS.schedInnenputz3]: { factor: 1.0 },
};

// ── History ─────────────────────────────────────────────────────────────

/** Werktage from `from` to `to`, both inclusive. */
function werktageRange(from: string, to: string, region: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addCalendarDays(d, 1)) if (isWerktag(d, region)) out.push(d);
  return out;
}

let counter = 0;
const nextId = () => seedId(20000 + ++counter);

function progressFor(items: ScheduleItem[], pace: Record<string, Pace>, today: string, wt: Wt, region: string): ProgressEntry[] {
  const yesterday = subWerktage(today, 1, region);
  const skipDays = (p: Pace) => new Set((p.skip ?? []).map((n) => wt(n)));
  const out: ProgressEntry[] = [];
  for (const it of items) {
    const p = pace[it.id];
    if (!p || !it.planned_qty || !it.planned_per_day) continue;
    const skip = skipDays(p);
    let cum = 0;
    // Work continues past the planned end until the quantity is done.
    werktageRange(it.start_date, yesterday, region).forEach((d, i) => {
      if (skip.has(d)) return;
      let q = Math.round(it.planned_per_day! * p.factor * WOBBLE[i % WOBBLE.length]);
      q = Math.min(q, it.planned_qty! - cum);
      if (q <= 0) return;
      cum += q;
      out.push({ id: nextId(), schedule_item_id: it.id, date: d, actual_qty: q, note: null });
    });
  }
  return out;
}

/** Which teams miss which report (Werktag offsets; 0 = today). */
const MISSING: Record<string, number[]> = {
  [IDS.teamHaustechnik]: [-1, 0], // B: missed yesterday, nothing yet today
  [IDS.teamEstrich]: [0], // B: the call this morning is the first entry today
  [IDS.teamFassadeC]: [-2, -1, 0], // C: no quantities, no report
  [IDS.teamAusbauA]: [-6],
};

function reportsFor(teams: Team[], trades: Trade[], items: ScheduleItem[], today: string, wt: Wt, region: string, now: Date): DailyReport[] {
  const out: DailyReport[] = [];
  const days = werktageRange(subWerktage(today, 16, region), today, region);
  for (const t of teams) {
    const tradeIds = new Set(trades.filter((x) => x.team_id === t.id).map((x) => x.id));
    const mine = items.filter((i) => tradeIds.has(i.trade_id));
    const missing = new Set((MISSING[t.id] ?? []).map((n) => wt(n)));
    for (const d of days) {
      if (missing.has(d) || !mine.some((i) => i.start_date <= d && d <= i.end_date)) continue;
      const isToday = d === today;
      const at = isToday ? new Date(Math.min(now.getTime(), berlinTime(d, 7, 5).getTime())) : berlinTime(d, 16, 40);
      out.push({
        id: nextId(),
        team_id: t.id,
        date: d,
        data: {
          entries: [
            isToday
              ? { kind: "note", text: "Morgen-Check-in: Plan für heute bestätigt.", at: at.toISOString(), by: null }
              : { kind: "note", text: "Abend-Check-in: Tagesleistung gemeldet.", at: at.toISOString(), by: null },
          ],
        },
        status: isToday ? "entwurf" : "eingereicht",
        missing_fields: [],
      });
    }
  }
  return out;
}

type CaseSpec = {
  n: number;
  project: string;
  team: string;
  doc: string;
  status: CaseStatus;
  /** "this" | "last" week for sent letters; validated: Werktage ago. */
  sent?: "this" | "last";
  validatedAgo?: number;
  createdAgo?: number;
  trade: string;
  facts: (day: string) => Record<string, unknown>;
  missing?: string[];
};

const CASES: CaseSpec[] = [
  // A – Schwabing
  { n: 26, project: IDS.projectA, team: IDS.teamAusbauA, doc: "behinderungsanzeige", status: "abgeschlossen", sent: "last", trade: "Sanitär", facts: (d) => ({ start_at: berlinTime(d, 7, 0).toISOString(), area: "1.OG", cause: "Vorwandinstallation Sanitär im 1. OG nicht fertig, Trockenbau konnte nicht schließen", affected_works: "Beplankung Vorsatzschalen 1. OG", idle_staff: "3 Facharbeiter", expected_duration: "ca. 1 Arbeitstag", _trade: "Sanitär" }) },
  { n: 27, project: IDS.projectA, team: IDS.teamRohbauA, doc: "mehrkostenanzeige", status: "versendet", sent: "last", trade: "Rohbau", facts: (d) => ({ work_started: false, instruction_date: d, instructed_by: "Dr. Michael Brandl (Schwabing Office Campus GmbH)", description: "Zusätzliche Deckendurchbrüche für Lüftung im 4. OG nach geänderter TGA-Planung", planned_start: addCalendarDays(d, 7), estimate_eur: 8400, verbal: false, _trade: "Rohbau" }) },
  { n: 28, project: IDS.projectA, team: IDS.teamRohbauA, doc: "anordnung_bestaetigung", status: "versendet", sent: "last", trade: "Rohbau", facts: (d) => ({ instruction_date: d, instruction_time: "10:30", place: "Baustelle, Besprechungscontainer", instructed_by: "Dr. Michael Brandl (Schwabing Office Campus GmbH)", instruction_text: "Aussparungen für Lüftungskanäle in der Decke über dem 4. OG nach Plan TGA-412 Index C herstellen", witnesses: "Markus Hofmann", _trade: "Rohbau" }) },
  { n: 29, project: IDS.projectA, team: IDS.teamAusbauA, doc: "mehrkostenanzeige", status: "beantwortet", sent: "last", trade: "Trockenbau", facts: (d) => ({ work_started: false, instruction_date: d, instructed_by: "Dr. Michael Brandl (Schwabing Office Campus GmbH)", description: "Schallschutzwände F90 statt F30 in den Besprechungsräumen 2. OG", planned_start: addCalendarDays(d, 5), estimate_eur: 3200, verbal: true, _trade: "Trockenbau" }) },
  { n: 30, project: IDS.projectA, team: IDS.teamRohbauA, doc: "anordnung_bestaetigung", status: "versendet", sent: "this", trade: "Rohbau", facts: (d) => ({ instruction_date: d, instruction_time: "08:15", place: "Baustelle, 4. OG", instructed_by: "Dr. Michael Brandl (Schwabing Office Campus GmbH)", instruction_text: "Zusätzliche Bewehrung im Bereich der Dachterrasse nach Statik-Nachtrag 7 einbauen", witnesses: "Markus Hofmann", _trade: "Rohbau" }) },
  { n: 31, project: IDS.projectA, team: IDS.teamRohbauA, doc: "mehrkostenanzeige", status: "versendet", sent: "this", trade: "Rohbau", facts: (d) => ({ work_started: false, instruction_date: d, instructed_by: "Dr. Michael Brandl (Schwabing Office Campus GmbH)", description: "Zusätzliche Bewehrung Dachterrasse nach Statik-Nachtrag 7", planned_start: addCalendarDays(d, 3), estimate_eur: 12600, verbal: true, _trade: "Rohbau" }) },
  { n: 32, project: IDS.projectA, team: IDS.teamAusbauA, doc: "bedenken", status: "versendet", sent: "this", trade: "Trockenbau", facts: (d) => ({ raised_at: d, concern: "Geplante Gipskartonplatten im Duschbereich 1. OG sind nicht für Feuchträume geeignet (Beanspruchungsklasse W3)", area: "1.OG", source: "Baustellenbegehung", _trade: "Trockenbau" }) },
  { n: 33, project: IDS.projectA, team: IDS.teamAusbauA, doc: "mehrkostenanzeige", status: "bereit", createdAgo: 1, trade: "Trockenbau", facts: (d) => ({ work_started: false, instruction_date: d, instructed_by: "Dr. Michael Brandl (Schwabing Office Campus GmbH)", description: "Imprägnierte Gipskartonplatten im Duschbereich 1. OG statt Standardplatten", planned_start: addCalendarDays(d, 4), estimate_eur: 5400, verbal: true, _trade: "Trockenbau" }) },
  { n: 34, project: IDS.projectA, team: IDS.teamRohbauA, doc: "maengelanzeige", status: "unvollstaendig", createdAgo: 0, trade: "Elektro", missing: ["area"], facts: (d) => ({ noticed_at: d, defect: "Leerrohre in der Decke über 3. OG teilweise gequetscht, Kabelzug nicht möglich", trade: "Elektro", source: "Morgen-Check-in", _trade: "Elektro" }) },
  { n: 35, project: IDS.projectA, team: IDS.teamRohbauA, doc: "anordnung_bestaetigung", status: "validiert", validatedAgo: 1, trade: "Rohbau", facts: (d) => ({ instruction_date: d, instruction_time: "14:00", place: "Baustelle, Dachgeschoss", instructed_by: "Dr. Michael Brandl (Schwabing Office Campus GmbH)", instruction_text: "Attika an der Südseite 20 cm höher ausführen", witnesses: "Markus Hofmann", _trade: "Rohbau" }) },
  // C – Pasing
  { n: 36, project: IDS.projectC, team: IDS.teamRohbauC, doc: "behinderungsanzeige", status: "abgeschlossen", sent: "this", trade: "Rohbau", facts: (d) => ({ start_at: berlinTime(d, 7, 0).toISOString(), area: "EG", cause: "Starkregen, Baugrube Bauteil B geflutet", affected_works: "Bewehrung Treppenhauskern Bauteil B", idle_staff: "5 Facharbeiter", expected_duration: "ca. 1 Arbeitstag", _trade: "Rohbau" }) },
  { n: 37, project: IDS.projectC, team: IDS.teamFassadeC, doc: "maengelanzeige", status: "versendet", sent: "this", trade: "Fassade", facts: (d) => ({ noticed_at: d, defect: "Fensteranschlüsse Nordfassade 1. OG ohne Kompriband, Dämmplatten können nicht angeschlossen werden", area: "1.OG", trade: "Fassade", source: "Abnahme Fensterbauer", _trade: "Fassade" }) },
  { n: 38, project: IDS.projectC, team: IDS.teamFassadeC, doc: "mehrkostenanzeige", status: "bereit", createdAgo: 2, trade: "Fassade", facts: (d) => ({ work_started: false, instruction_date: d, instructed_by: "Sabine Köhler (Bildungsbau München GmbH)", description: "Mineralwolle statt EPS im Sockelbereich Nordfassade (Brandschutzkonzept Rev. 3)", planned_start: addCalendarDays(d, 6), estimate_eur: 9800, verbal: false, _trade: "Fassade" }) },
  { n: 39, project: IDS.projectC, team: IDS.teamRohbauC, doc: "anordnung_bestaetigung", status: "bereit", createdAgo: 1, trade: "Rohbau", facts: (d) => ({ instruction_date: d, instruction_time: "09:40", place: "Baustelle, Bauteil B", instructed_by: "Sabine Köhler (Bildungsbau München GmbH)", instruction_text: "Zusätzliche Bodenabläufe im Werkraum EG vorsehen", witnesses: "Markus Hofmann", _trade: "Rohbau" }) },
  { n: 40, project: IDS.projectC, team: IDS.teamFassadeC, doc: "bedenken", status: "unvollstaendig", createdAgo: 0, trade: "Fassade", missing: ["area"], facts: (d) => ({ raised_at: d, concern: "Dübelbild WDVS laut Plan für Windlastzone am Gebäuderand nicht ausreichend", source: "Morgen-Check-in", _trade: "Fassade" }) },
  { n: 41, project: IDS.projectC, team: IDS.teamRohbauC, doc: "mehrkostenanzeige", status: "bereit", createdAgo: 1, trade: "Sanitär", facts: (d) => ({ work_started: false, instruction_date: d, instructed_by: "Sabine Köhler (Bildungsbau München GmbH)", description: "Zusätzliche Bodenabläufe im Werkraum EG", planned_start: addCalendarDays(d, 5), estimate_eur: 2600, verbal: true, _trade: "Sanitär" }) },
];

const SENT_STATUSES = new Set<CaseStatus>(["versendet", "beantwortet", "abgeschlossen"]);

/** Letters with versions and events (A and C only). */
function casesFor(base: Base, today: string, now: Date, region: string): { case: Case[]; document_version: DocumentVersion[]; event: AppEvent[] } {
  const year = today.slice(0, 4);
  const monday = addCalendarDays(today, -((weekday(today) + 6) % 7));
  const thisWeek = werktageRange(monday, today, region);
  const lastWeek = werktageRange(addCalendarDays(monday, -7), addCalendarDays(monday, -2), region);
  const cases: Case[] = [];
  const versions: DocumentVersion[] = [];
  const events: AppEvent[] = [];
  let thisK = 0;
  let lastK = 0;

  for (const spec of CASES) {
    let sentAt: Date | null = null;
    if (spec.sent === "this") {
      const day = thisWeek[thisK % thisWeek.length];
      const t = berlinTime(day, 8, 10 + 9 * thisK);
      sentAt = t > now ? new Date(now.getTime() - (CASES.length - thisK) * 6 * 60_000) : t;
      thisK++;
    } else if (spec.sent === "last") {
      sentAt = berlinTime(lastWeek[(lastK * 2) % lastWeek.length], 9, 20 + 7 * lastK);
      lastK++;
    }
    const createdDay = sentAt ? subWerktage(dayOf(sentAt), 1, region) : subWerktage(today, spec.createdAgo ?? spec.validatedAgo ?? 1, region);
    const created = spec.createdAgo === 0 ? new Date(Math.min(now.getTime() - 40 * 60_000, berlinTime(today, 7, 30).getTime())) : berlinTime(createdDay, 7, 40);
    const validatedAt = sentAt
      ? new Date(sentAt.getTime() - 15 * 60_000)
      : spec.status === "validiert"
        ? berlinTime(subWerktage(today, spec.validatedAgo ?? 1, region), 15, 10)
        : null;
    const ref = `KL-${year}-${String(spec.n).padStart(4, "0")}`;
    const c: Case = {
      id: seedId(30000 + spec.n),
      project_id: spec.project,
      team_id: spec.team,
      conversation_id: null,
      doc_type: spec.doc,
      status: spec.status,
      sphere: spec.doc === "behinderungsanzeige" ? (spec.trade === "Rohbau" ? "weather" : "own_sub") : null,
      facts: spec.facts(dayOf(created)),
      missing_fields: spec.missing ?? [],
      checks: [],
      deadline_at: null,
      deadline_rule: null,
      parent_case_id: null,
      reference: ref,
      created_by: IDS.userBauleiter,
      asked_fields: [],
      declined_fields: [],
      flags: ["seed_history"],
      created_at: created.toISOString(),
      updated_at: (sentAt ?? validatedAt ?? created).toISOString(),
    };
    cases.push(c);
    events.push(ev(c, "case_created", created, { reference: ref, doc_type: c.doc_type, source: "call" }));

    if (spec.status !== "unvollstaendig") {
      const ctx = {
        project: base.project.find((p) => p.id === c.project_id)!,
        contacts: base.contact.filter((x) => x.project_id === c.project_id),
        trades: base.trade.filter((x) => x.project_id === c.project_id),
        teams: base.team.filter((x) => x.project_id === c.project_id),
        schedule: base.schedule_item.filter((x) => x.project_id === c.project_id),
        company: base.company[0],
        users: base.app_user,
      };
      const body = buildBody({ c, letterDate: dayOf(created) }, ctx);
      const vid = seedId(40000 + spec.n);
      versions.push({
        id: vid,
        case_id: c.id,
        version: 1,
        body,
        body_md: toMarkdown(body),
        pdf_url: `/api/documents/${vid}/pdf`,
        docx_url: `/api/documents/${vid}/docx`,
        sha256: null,
        addressee_contact_id: ctx.contacts.find((x) => x.role === "bauherr")?.id ?? null,
        tone: null,
        created_at: created.toISOString(),
        validated_by: validatedAt ? IDS.userBauleiter : null,
        validated_at: validatedAt?.toISOString() ?? null,
        sent_at: sentAt?.toISOString() ?? null,
        delivery_status: sentAt ? "zugestellt" : null,
        immutable: !!sentAt,
      });
      if (validatedAt) events.push(ev(c, "document_validated", validatedAt, { reference: ref }));
      if (sentAt) events.push(ev(c, "email_sent", sentAt, { reference: ref, source: "email", summary_de: `${docTitle(c.doc_type)} ${ref} versendet` }));
      if (spec.status === "beantwortet" && sentAt) {
        events.push(ev(c, "reply_received", new Date(sentAt.getTime() + 26 * 3600_000), { reference: ref, source: "email", summary_de: "Bauherr bestätigt den Nachtrag dem Grunde nach" }));
      }
    }
  }
  void SENT_STATUSES;
  return { case: cases, document_version: versions, event: events };
}

const dayOf = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);

function ev(c: Pick<Case, "id" | "project_id">, kind: string, at: Date, payload: Record<string, unknown>): AppEvent {
  return { id: nextId(), case_id: c.id, project_id: c.project_id, kind, payload, created_at: at.toISOString() };
}

/** Check-in events of the last two days (the feed's "Check-in" source). */
function checkinEvents(reports: DailyReport[], teams: Team[], today: string, region: string): AppEvent[] {
  const since = subWerktage(today, 1, region);
  return reports
    .filter((r) => r.date >= since)
    .map((r) => {
      const team = teams.find((t) => t.id === r.team_id)!;
      const entry = (r.data.entries as { text: string; at: string }[])[0];
      return {
        id: nextId(),
        case_id: null,
        project_id: team.project_id,
        kind: "diary_entry",
        payload: { team_id: team.id, source: "checkin", text: `${team.name}: ${entry.text}` },
        created_at: entry.at,
      };
    });
}

/**
 * Add sites A and C and the history of all three sites to the base seed (B).
 * Deterministic for a given `now`.
 */
type Base = { [K in keyof Required<SeedData>]: NonNullable<SeedData[K]> };

export function withPortfolio(input: SeedData, now: Date, region: string): SeedData {
  const base = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v ?? []])) as Base;
  counter = 0;
  const today = dayOf(now);
  const wt: Wt = (n) => (n >= 0 ? addWerktageLocal(today, n, region) : subWerktage(today, -n, region));
  const settings = base.project[0].settings;
  const a = siteA(region, settings);
  const c = siteC(region, settings);
  const { items, pace } = portfolioSchedule(wt);

  const seed: Base = {
    ...base,
    project: [...base.project, a.project, c.project],
    contact: [...base.contact, ...a.contacts, ...c.contacts],
    team: [...base.team, ...a.teams, ...c.teams],
    trade: [...base.trade, ...a.trades, ...c.trades],
    schedule_item: [...base.schedule_item, ...items],
  };
  const progress = progressFor(seed.schedule_item, { ...B_PACE, ...pace }, today, wt, region);
  const reports = reportsFor(seed.team, seed.trade, seed.schedule_item, today, wt, region, now);
  const letters = casesFor(seed, today, now, region);
  return {
    ...seed,
    progress_entry: [...base.progress_entry, ...progress],
    daily_report: [...base.daily_report, ...reports],
    case: [...base.case, ...letters.case],
    document_version: [...base.document_version, ...letters.document_version],
    event: [...base.event, ...letters.event, ...checkinEvents(reports, seed.team, today, region)].sort((x, y) => x.created_at.localeCompare(y.created_at)),
  };
}

function addWerktageLocal(day: string, n: number, region: string): string {
  let cur = day;
  let left = n;
  while (left > 0) {
    cur = addCalendarDays(cur, 1);
    if (isWerktag(cur, region)) left--;
  }
  return cur;
}
