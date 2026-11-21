// Fictional seed data (SPEC §9). Schedule dates are relative to the seed day so
// the demo always plays "today". Fixed UUIDs keep links stable across resets.
import { addWerktage, berlinDay, subWerktage, DEFAULT_HOLIDAY_REGION } from "@/lib/deadlines";
import { IDS } from "@/lib/ids";
import { buildSeedMeetings } from "@/lib/meetings/sample";
import { withPortfolio } from "./seed-portfolio";
import type { SeedData } from "./store";

export { IDS };

export const DEFAULT_PROJECT_ID = IDS.project;

export const DEFAULT_VAD = { silence_ms: 800, min_speech_ms: 400, positive_threshold: 0.5 };

export function buildSeed(now: Date = new Date()): SeedData {
  const region = DEFAULT_HOLIDAY_REGION;
  const today = berlinDay(now);
  const wt = (n: number) => (n >= 0 ? addWerktage(today, n, region) : subWerktage(today, -n, region));
  const clientMailbox = process.env.DEMO_CLIENT_MAILBOX || "petra.lang@wohnbau-riem.example";

  const base: SeedData = {
    company: [
      {
        id: IDS.company,
        name: "Muster Bau GmbH",
        logo_url: null,
        address: "Landsberger Straße 302, 80687 München",
      },
    ],
    app_user: [
      { id: IDS.userPolierEstrich, name: "Sergej Iwanow", role: "polier", language: "ru", email: null },
      { id: IDS.userPolierAusbau, name: "Piotr Kowalski", role: "polier", language: "pl", email: null },
      { id: IDS.userBauleiter, name: "Markus Hofmann", role: "bauleiter", language: "de", email: "m.hofmann@muster-bau.example" },
      { id: IDS.userBuero, name: "Julia Brenner", role: "buero", language: "de", email: "j.brenner@muster-bau.example" },
    ],
    project: [
      {
        id: IDS.project,
        company_id: IDS.company,
        name: "Wohnanlage Riem",
        address: "Riemer Straße 12, 81829 München",
        lat: 48.1339,
        lng: 11.6929,
        contract_type: "VOB_B",
        contract_no: "WR-2026-114",
        contract_date: "2026-03-02",
        settings: {
          fiktive_abnahme_excluded: false,
          holiday_region: region,
          demo_clock_offset_ms: 0,
          vad: DEFAULT_VAD,
          hourly_rates: { Polier: 64, Facharbeiter: 58, Helfer: 46 },
          site_code: "B",
        },
      },
    ],
    contact: [
      {
        id: IDS.contactBauherr,
        project_id: IDS.project,
        name: "Dr. Petra Lang",
        organisation: "Wohnbau Riem GmbH",
        role: "bauherr",
        email: clientMailbox,
        has_authority: true,
        address: "Willy-Brandt-Allee 10, 81829 München",
      },
      {
        id: IDS.contactArchitekt,
        project_id: IDS.project,
        name: "Thomas Weber",
        organisation: "Büro Weber Architekten",
        role: "architekt",
        email: "t.weber@buero-weber.example",
        has_authority: false,
        address: "Leopoldstraße 112, 80802 München",
      },
      {
        id: IDS.contactTrockenbau,
        project_id: IDS.project,
        name: "Marek Nowak",
        organisation: "Nowak Trockenbau GmbH",
        role: "nu",
        email: "m.nowak@nowak-trockenbau.example",
        has_authority: true,
        address: "Frankfurter Ring 81, 80807 München",
      },
      {
        id: IDS.contactBodenbelag,
        project_id: IDS.project,
        name: "Anna Huber",
        organisation: "Huber Bodenbeläge GmbH & Co. KG",
        role: "nu",
        email: "a.huber@huber-boden.example",
        has_authority: true,
        address: "Rosenheimer Straße 145, 81671 München",
      },
    ],
    team: [
      { id: IDS.teamEstrich, project_id: IDS.project, name: "Team Estrich", lead_user_id: IDS.userPolierEstrich },
      { id: IDS.teamAusbau, project_id: IDS.project, name: "Team Ausbau", lead_user_id: IDS.userPolierAusbau },
      { id: IDS.teamHaustechnik, project_id: IDS.project, name: "Team Haustechnik", lead_user_id: null },
    ],
    trade: [
      { id: IDS.tradeElektro, project_id: IDS.project, name: "Elektro", contracted_by: "client", contact_id: null, team_id: null },
      { id: IDS.tradeTrockenbau, project_id: IDS.project, name: "Trockenbau", contracted_by: "us", contact_id: IDS.contactTrockenbau, team_id: null },
      { id: IDS.tradeEstrich, project_id: IDS.project, name: "Estrich", contracted_by: "us", contact_id: null, team_id: IDS.teamEstrich },
      { id: IDS.tradeBodenbelag, project_id: IDS.project, name: "Bodenbelag", contracted_by: "us", contact_id: IDS.contactBodenbelag, team_id: null },
      { id: IDS.tradeSanitaer, project_id: IDS.project, name: "Sanitär", contracted_by: "us", contact_id: null, team_id: IDS.teamHaustechnik },
      { id: IDS.tradeInnenputz, project_id: IDS.project, name: "Innenputz", contracted_by: "us", contact_id: null, team_id: IDS.teamAusbau },
    ],
    schedule_item: [
      {
        id: IDS.schedElektro2,
        project_id: IDS.project,
        trade_id: IDS.tradeElektro,
        activity: "Elektroinstallation (Leerrohre, Bodentanks)",
        area: "2.OG",
        start_date: wt(-12),
        end_date: wt(-2),
        planned_qty: 1100,
        unit: "m",
        planned_per_day: 100,
        depends_on: [],
      },
      {
        id: IDS.schedElektro3,
        project_id: IDS.project,
        trade_id: IDS.tradeElektro,
        activity: "Elektroinstallation (Leerrohre, Bodentanks)",
        area: "3.OG",
        start_date: wt(2),
        end_date: wt(10),
        planned_qty: 1260,
        unit: "m",
        planned_per_day: 140,
        depends_on: [],
      },
      {
        id: IDS.schedEstrich2,
        project_id: IDS.project,
        trade_id: IDS.tradeEstrich,
        activity: "Zementestrich CT-C25-F4 auf Trennlage, 65 mm",
        area: "2.OG",
        start_date: wt(-1),
        end_date: wt(3),
        planned_qty: 200,
        unit: "m²",
        planned_per_day: 40,
        depends_on: [IDS.schedElektro2],
      },
      {
        id: IDS.schedTrockenbau2,
        project_id: IDS.project,
        trade_id: IDS.tradeTrockenbau,
        activity: "Metallständerwände und Schachtwände",
        area: "2.OG",
        start_date: wt(-4),
        end_date: wt(2),
        planned_qty: 320,
        unit: "m²",
        planned_per_day: 50,
        depends_on: [],
      },
      {
        id: IDS.schedBodenbelag2,
        project_id: IDS.project,
        trade_id: IDS.tradeBodenbelag,
        activity: "Textiler Bodenbelag nach Belegreife",
        area: "2.OG",
        start_date: wt(26),
        end_date: wt(31),
        planned_qty: 200,
        unit: "m²",
        planned_per_day: 40,
        depends_on: [IDS.schedEstrich2],
      },
      {
        id: IDS.schedEstrich1,
        project_id: IDS.project,
        trade_id: IDS.tradeEstrich,
        activity: "Zementestrich CT-C25-F4 auf Trennlage, 65 mm",
        area: "1.OG",
        start_date: wt(-9),
        end_date: wt(-2),
        planned_qty: 280,
        unit: "m²",
        planned_per_day: 35,
        depends_on: [],
      },
      {
        id: IDS.schedSanitaer3,
        project_id: IDS.project,
        trade_id: IDS.tradeSanitaer,
        activity: "Sanitär-Rohinstallation",
        area: "3.OG",
        start_date: wt(-7),
        end_date: wt(4),
        planned_qty: 36,
        unit: "Stk",
        planned_per_day: 3,
        depends_on: [],
      },
      {
        id: IDS.schedInnenputz3,
        project_id: IDS.project,
        trade_id: IDS.tradeInnenputz,
        activity: "Innenputz Q2",
        area: "3.OG",
        start_date: wt(-10),
        end_date: wt(3),
        planned_qty: 840,
        unit: "m²",
        planned_per_day: 60,
        depends_on: [],
      },
    ],
    progress_entry: [
      { id: IDS.progressEstrich2, schedule_item_id: IDS.schedEstrich2, date: wt(-1), actual_qty: 40, note: "Achsen A–C" },
    ],
    conversation: [],
    turn: [],
    case: [],
    document_version: [],
    evidence: [],
    email_out: [],
    email_in: [],
    daily_report: [],
    meeting: buildSeedMeetings(now),
    event: [],
  };
  // Baustellen A and C, and 14 Werktage of history for all three sites.
  return withPortfolio(base, now, region);
}
