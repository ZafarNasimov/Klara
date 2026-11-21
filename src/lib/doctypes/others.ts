// Doc types that Klara builds from computed data rather than a site report
// (reply to a rejection, daily report) and the two "should" types the test
// scenarios need (Abhilfeaufforderung an NU, Information an Folgegewerke).
import type { DocTypeDef } from "./types";

export const stellungnahmeZurueckweisung: DocTypeDef = {
  id: "stellungnahme_zurueckweisung",
  title_de: "Stellungnahme zur Zurückweisung",
  legal_basis: "Antwort auf Schreiben des Auftraggebers",
  tier: "A",
  build_priority: "must",
  recipient: "client_with_authority",
  // Practice: answer within 3 Werktage of the client's letter.
  deadline: { kind: "working_days_after", days: 3, from: "reply" },
  event_time_field: "reply_date",
  checks: ["required_fields", "recipient", "channel"],
  max_questions: 3,
  fields: [
    { key: "reply_date", label_de: "Datum des Schreibens", type: "date", required: true, source: "computed", question_hint: "" },
    { key: "reply_quote", label_de: "Kern der Zurückweisung", type: "text", required: true, source: "computed", question_hint: "" },
    { key: "orig_reference", label_de: "Unser Zeichen (Anzeige)", type: "text", required: true, source: "computed", question_hint: "" },
    { key: "orig_date", label_de: "Datum unserer Anzeige", type: "date", required: true, source: "computed", question_hint: "" },
    { key: "evidence_bullets", label_de: "Nachweise", type: "list", required: true, source: "computed", question_hint: "" },
  ],
  readback_fields: [],
};

/**
 * SPEC §6.4 `request_info`: the client asks for more information on one of
 * our letters. The requested items come from the reply; the answers from the
 * Polier, whom Klara asks in the team chat right away.
 */
export const ergaenzung: DocTypeDef = {
  id: "ergaenzung",
  title_de: "Ergänzende Angaben",
  legal_basis: "Antwort auf Rückfrage des Auftraggebers",
  tier: "A",
  build_priority: "must",
  recipient: "client_with_authority",
  // Practice, as for the Stellungnahme: answer within 3 Werktage.
  deadline: { kind: "working_days_after", days: 3, from: "reply" },
  event_time_field: "reply_date",
  checks: ["required_fields", "recipient", "channel"],
  max_questions: 3,
  fields: [
    { key: "reply_date", label_de: "Datum der Rückfrage", type: "date", required: true, source: "computed", question_hint: "" },
    { key: "orig_reference", label_de: "Unser Zeichen", type: "text", required: true, source: "computed", question_hint: "" },
    { key: "orig_date", label_de: "Datum unseres Schreibens", type: "date", required: true, source: "computed", question_hint: "" },
    { key: "requested_items", label_de: "Erbetene Angaben", type: "list", required: true, source: "computed", question_hint: "" },
    {
      key: "answers",
      label_de: "Unsere Angaben",
      type: "text",
      required: true,
      question_hint: "What should we answer to the client's questions?",
      ask: {
        en: "What should I answer?",
        de: "Was soll ich antworten?",
        ru: "Что мне ответить?",
      },
      extract_hint:
        "German, factual, full sentences; answer each requested item in order, only with what the user said. No legal assessments.",
    },
  ],
  readback_fields: ["answers"],
};

export const bautagesbericht: DocTypeDef = {
  id: "bautagesbericht",
  title_de: "Bautagesbericht",
  legal_basis: "Vertrag / ZVB; Gliederung nach VHB Bund 411",
  tier: "A",
  build_priority: "must",
  recipient: "internal",
  deadline: { kind: "calendar_days_after", days: 1, from: "report_date" },
  event_time_field: "date",
  checks: ["required_fields", "recipient"],
  max_questions: 3,
  fields: [
    { key: "date", label_de: "Berichtstag", type: "date", required: true, source: "computed", question_hint: "" },
    { key: "weather", label_de: "Witterung", type: "text", required: false, source: "computed", question_hint: "" },
    {
      key: "staff",
      label_de: "Personal",
      type: "text",
      required: true,
      question_hint: "How many people were on site today, by role?",
      ask: {
        en: "How many people were on site today, foreman, skilled workers, helpers?",
        de: "Wie viele Leute waren heute da, Polier, Facharbeiter, Helfer?",
        ru: "Сколько человек было сегодня на объекте: прораб, рабочие, помощники?",
      },
      extract_hint: "German, e.g. '1 Polier, 3 Facharbeiter, 1 Helfer'.",
    },
    { key: "equipment", label_de: "Geräte", type: "text", required: false, question_hint: "Which machines were used?" },
    { key: "deliveries", label_de: "Lieferungen", type: "text", required: false, question_hint: "Any deliveries today?" },
    { key: "work_performed", label_de: "Ausgeführte Leistungen", type: "list", required: true, source: "computed", question_hint: "" },
    { key: "instructions", label_de: "Anordnungen", type: "text", required: false, question_hint: "Any instructions received?" },
    {
      key: "incidents",
      label_de: "Besondere Vorkommnisse",
      type: "text",
      required: false,
      unknown_value_de: "keine",
      question_hint: "Anything special today? Hindrances, defects, accidents?",
      ask: {
        en: "Anything special today, hindrances, defects or accidents?",
        de: "Besondere Vorkommnisse heute? Behinderungen, Mängel, Unfälle?",
        ru: "Было сегодня что-то особенное: помехи, дефекты, несчастные случаи?",
      },
    },
  ],
  readback_fields: ["staff", "work_performed", "incidents"],
};

export const verzugNu: DocTypeDef = {
  id: "verzug_nu",
  title_de: "Abhilfeaufforderung an Nachunternehmer",
  legal_basis: "§ 5 Abs. 3 VOB/B (Nachunternehmervertrag)",
  tier: "B",
  build_priority: "should",
  recipient: "subcontractor",
  deadline: { kind: "unverzueglich" },
  event_time_field: "start_at",
  checks: ["required_fields", "recipient", "timing_unverzueglich", "channel", "confidence"],
  max_questions: 3,
  when_de: "Ein eigener Nachunternehmer ist nicht erschienen, zu wenig Personal, Leistung verzögert.",
  fields: [
    {
      key: "start_at",
      label_de: "Seit",
      type: "datetime",
      required: true,
      question_hint: "Since when exactly? Date and time.",
      ask: {
        en: "Since when exactly? Date and time, please.",
        de: "Seit wann genau? Bitte Datum und Uhrzeit.",
        ru: "С какого момента точно? Дата и время, пожалуйста.",
      },
      extract_hint: "ISO 8601 with offset.",
    },
    {
      key: "area",
      label_de: "Bereich",
      type: "text",
      required: true,
      question_hint: "Where exactly (floor/section)?",
      ask: {
        en: "Where exactly, which floor or section?",
        de: "Wo genau, welches Geschoss oder welcher Abschnitt?",
        ru: "Где именно, какой этаж или участок?",
      },
    },
    {
      key: "cause",
      label_de: "Sachverhalt",
      type: "text",
      required: true,
      question_hint: "What exactly happened?",
      ask: { en: "What exactly happened?", de: "Was genau ist passiert?", ru: "Что именно произошло?" },
      extract_hint: "German, e.g. 'Die Trockenbaukolonne ist heute nicht auf der Baustelle erschienen.'",
    },
    {
      key: "affected_works",
      label_de: "Betroffene Leistungen",
      type: "text",
      required: false,
      question_hint: "Which works are affected?",
    },
    { key: "remedy_until", label_de: "Frist zur Abhilfe", type: "date", required: true, source: "computed", question_hint: "" },
  ],
  readback_fields: ["start_at", "area", "cause", "affected_works"],
};

export const infoFolgegewerk: DocTypeDef = {
  id: "info_folgegewerk",
  title_de: "Information an Folgegewerk (Terminverschiebung)",
  legal_basis: "Koordination der Gewerke",
  tier: "B",
  build_priority: "should",
  recipient: "subcontractor",
  deadline: { kind: "unverzueglich" },
  event_time_field: "report_date",
  checks: ["recipient", "channel"],
  max_questions: 3,
  fields: [
    { key: "report_date", label_de: "Stand", type: "date", required: true, source: "computed", question_hint: "" },
    { key: "predecessor", label_de: "Vorleistung", type: "text", required: true, source: "computed", question_hint: "" },
    { key: "successor", label_de: "Folgeleistung", type: "text", required: true, source: "computed", question_hint: "" },
    { key: "forecast_delay_days", label_de: "Prognose Verzug (Arbeitstage)", type: "number", required: true, source: "computed", question_hint: "" },
    { key: "planned_start", label_de: "Bisheriger Beginn", type: "date", required: true, source: "computed", question_hint: "" },
    { key: "new_start", label_de: "Voraussichtlicher Beginn", type: "date", required: true, source: "computed", question_hint: "" },
    { key: "basis", label_de: "Grundlage", type: "text", required: true, source: "computed", question_hint: "" },
  ],
  readback_fields: [],
};
