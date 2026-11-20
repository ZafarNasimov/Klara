// Fictional seed data (SPEC.md §9). Dates are relative to the seed day so the
// demo schedule always looks current.
import type { Tables, TableName } from "@/lib/types";

export const IDS = {
  company: "00000000-0000-4000-8000-000000000001",
  project: "00000000-0000-4000-8000-000000000010",
  contactBauherr: "00000000-0000-4000-8000-000000000101",
  contactArchitekt: "00000000-0000-4000-8000-000000000102",
  contactTrockenbau: "00000000-0000-4000-8000-000000000103",
  contactBodenbelag: "00000000-0000-4000-8000-000000000104",
  contactElektro: "00000000-0000-4000-8000-000000000105",
  tradeElektro: "00000000-0000-4000-8000-000000000201",
  tradeTrockenbau: "00000000-0000-4000-8000-000000000202",
  tradeEstrich: "00000000-0000-4000-8000-000000000203",
  tradeBodenbelag: "00000000-0000-4000-8000-000000000204",
  teamEstrich: "00000000-0000-4000-8000-000000000301",
  teamAusbau: "00000000-0000-4000-8000-000000000302",
  userPolierEstrich: "00000000-0000-4000-8000-000000000401",
  userPolierAusbau: "00000000-0000-4000-8000-000000000402",
  userBauleiter: "00000000-0000-4000-8000-000000000403",
  userBuero: "00000000-0000-4000-8000-000000000404",
  schedEstrich: "00000000-0000-4000-8000-000000000501",
  schedElektro: "00000000-0000-4000-8000-000000000502",
  schedTrockenbau: "00000000-0000-4000-8000-000000000503",
  schedBodenbelag: "00000000-0000-4000-8000-000000000504",
} as const;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

export type SeedData = { [K in TableName]: Tables[K][] };

export function buildSeed(now: Date = new Date()): SeedData {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  return {
    company: [
      {
        id: IDS.company,
        name: "Muster Bau GmbH",
        logo_url: null,
        address: "Landsberger Straße 302, 80687 München",
      },
    ],
    project: [
      {
        id: IDS.project,
        company_id: IDS.company,
        name: "Neubau Bürogebäude München",
        address: "Werner-Heisenberg-Allee 12, 80939 München",
        lat: 48.1351,
        lng: 11.582,
        contract_type: "VOB_B",
        contract_no: "MB-2026-117",
        contract_date: "2026-03-02",
        settings: {
          fiktive_abnahme_excluded: false,
          demo_clock_offset_ms: 0,
          vad: { silence_ms: 800, min_speech_ms: 400, positive_threshold: 0.5 },
        },
      },
    ],
    contact: [
      {
        id: IDS.contactBauherr,
        project_id: IDS.project,
        name: "Dr. Petra Lang",
        organisation: "Immobilien Isar GmbH",
        role: "bauherr",
        email: "p.lang@immobilien-isar.example",
        has_authority: true,
        address: "Prinzregentenstraße 54, 80538 München",
      },
      {
        id: IDS.contactArchitekt,
        project_id: IDS.project,
        name: "Thomas Weber",
        organisation: "Büro Weber Architekten",
        role: "architekt",
        email: "t.weber@buero-weber.example",
        has_authority: false,
        address: "Schellingstraße 18, 80799 München",
      },
      {
        id: IDS.contactTrockenbau,
        project_id: IDS.project,
        name: "Marek Nowak",
        organisation: "Nowak Trockenbau GmbH",
        role: "nu",
        email: "m.nowak@nowak-trockenbau.example",
        has_authority: false,
        address: "Hansastraße 40, 81373 München",
      },
      {
        id: IDS.contactBodenbelag,
        project_id: IDS.project,
        name: "Sabine Huber",
        organisation: "Huber Bodenbeläge e. K.",
        role: "nu",
        email: "s.huber@huber-boden.example",
        has_authority: false,
        address: "Fraunhoferstraße 9, 80469 München",
      },
      {
        id: IDS.contactElektro,
        project_id: IDS.project,
        name: "Andreas Brandl",
        organisation: "Elektro Brandl GmbH (Auftrag Bauherr)",
        role: "nu",
        email: "a.brandl@elektro-brandl.example",
        has_authority: false,
        address: "Dachauer Straße 120, 80637 München",
      },
    ],
    trade: [
      {
        id: IDS.tradeElektro,
        project_id: IDS.project,
        name: "Elektro",
        contracted_by: "client",
        contact_id: IDS.contactElektro,
        team_id: null,
      },
      {
        id: IDS.tradeTrockenbau,
        project_id: IDS.project,
        name: "Trockenbau",
        contracted_by: "us",
        contact_id: IDS.contactTrockenbau,
        team_id: null,
      },
      {
        id: IDS.tradeEstrich,
        project_id: IDS.project,
        name: "Estrich",
        contracted_by: "us",
        contact_id: null,
        team_id: IDS.teamEstrich,
      },
      {
        id: IDS.tradeBodenbelag,
        project_id: IDS.project,
        name: "Bodenbelag",
        contracted_by: "us",
        contact_id: IDS.contactBodenbelag,
        team_id: null,
      },
    ],
    team: [
      { id: IDS.teamEstrich, project_id: IDS.project, name: "Team Estrich", lead_user_id: IDS.userPolierEstrich },
      { id: IDS.teamAusbau, project_id: IDS.project, name: "Team Ausbau", lead_user_id: IDS.userPolierAusbau },
    ],
    app_user: [
      { id: IDS.userPolierEstrich, name: "Sergej Iwanow", role: "polier", language: "ru", email: null },
      { id: IDS.userPolierAusbau, name: "Piotr Kowalski", role: "polier", language: "pl", email: null },
      { id: IDS.userBauleiter, name: "Markus Hofmann", role: "bauleiter", language: "de", email: "m.hofmann@muster-bau.example" },
      { id: IDS.userBuero, name: "Julia Brenner", role: "buero", language: "de", email: "j.brenner@muster-bau.example" },
    ],
    schedule_item: [
      {
        id: IDS.schedEstrich,
        project_id: IDS.project,
        trade_id: IDS.tradeEstrich,
        activity: "Zementestrich CT-C25-F4 einbauen",
        area: "2.OG",
        start_date: isoDate(addDays(today, -1)),
        end_date: isoDate(addDays(today, 4)),
        planned_qty: 200,
        unit: "m²",
        planned_per_day: 40,
        depends_on: [],
      },
      {
        id: IDS.schedElektro,
        project_id: IDS.project,
        trade_id: IDS.tradeElektro,
        activity: "Elektro-Rohinstallation, Leerrohre im Fußbodenaufbau",
        area: "3.OG",
        start_date: isoDate(addDays(today, -10)),
        end_date: isoDate(addDays(today, 2)),
        planned_qty: null,
        unit: null,
        planned_per_day: null,
        depends_on: [],
      },
      {
        id: IDS.schedTrockenbau,
        project_id: IDS.project,
        trade_id: IDS.tradeTrockenbau,
        activity: "Trockenbauwände Metallständer, beplankt",
        area: "2.OG",
        start_date: isoDate(addDays(today, -3)),
        end_date: isoDate(addDays(today, 6)),
        planned_qty: 450,
        unit: "m²",
        planned_per_day: 60,
        depends_on: [],
      },
      {
        id: IDS.schedBodenbelag,
        project_id: IDS.project,
        trade_id: IDS.tradeBodenbelag,
        activity: "Bodenbelag Linoleum verlegen",
        area: "2.OG",
        start_date: isoDate(addDays(today, 18)),
        end_date: isoDate(addDays(today, 24)),
        planned_qty: 200,
        unit: "m²",
        planned_per_day: 50,
        depends_on: [IDS.schedEstrich],
      },
    ],
    progress_entry: [
      { id: "00000000-0000-4000-8000-000000000601", schedule_item_id: IDS.schedEstrich, date: isoDate(addDays(today, -1)), actual_qty: 38, note: null },
    ],
    conversation: [],
    turn: [],
    case: [],
    document_version: [],
    evidence: [],
    email_out: [],
    email_in: [],
    daily_report: [],
    meeting: [],
    event: [],
  };
}
