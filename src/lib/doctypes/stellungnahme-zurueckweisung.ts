import type { DocTypeDef } from "./types";

// Generated from a classified client reply (M4); no questions to the Polier.
export const stellungnahmeZurueckweisung: DocTypeDef = {
  id: "stellungnahme_zurueckweisung",
  title_de: "Stellungnahme zur Zurückweisung",
  legal_basis: "Antwortschreiben",
  tier: "A",
  build_priority: "must",
  recipient: "client_with_authority",
  deadline: { kind: "working_days_after", days: 3, from: "reply_received" },
  event_time_field: "reply_date",
  checks: ["required_fields", "recipient"],
  max_questions: 3,
  fields: [
    { key: "reply_date", label_de: "Datum des Schreibens", type: "date", required: true, source: "computed", question_hint: "" },
    { key: "orig_date", label_de: "Datum unserer Anzeige", type: "date", required: true, source: "computed", question_hint: "" },
    { key: "orig_ref", label_de: "Zeichen unserer Anzeige", type: "text", required: true, source: "computed", question_hint: "" },
    { key: "rejection_quote", label_de: "Kern der Zurückweisung", type: "text", required: true, source: "computed", question_hint: "" },
    { key: "evidence_bullets", label_de: "Nachweise", type: "list", required: true, source: "computed", question_hint: "" },
  ],
};
