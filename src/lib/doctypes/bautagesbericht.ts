import type { DocTypeDef } from "./types";

// Fields modeled on VHB Bund RL 411 + contractor practice. Evening flow is a "Should".
export const bautagesbericht: DocTypeDef = {
  id: "bautagesbericht",
  title_de: "Bautagesbericht",
  legal_basis: "Vertrag / ZVB; Felder nach VHB Bund Richtlinie 411",
  tier: "A",
  build_priority: "must",
  recipient: "internal",
  deadline: { kind: "none" },
  checks: ["required_fields"],
  max_questions: 3,
  fields: [
    { key: "date", label_de: "Datum", type: "date", required: true, source: "computed", question_hint: "" },
    { key: "weather", label_de: "Witterung", type: "text", required: true, source: "computed", question_hint: "" },
    { key: "staff_polier", label_de: "Poliere", type: "number", required: false, source: "user", question_hint: "How many foremen were on site?" },
    { key: "staff_facharbeiter", label_de: "Facharbeiter", type: "number", required: true, source: "user", question_hint: "How many skilled workers were on site?" },
    { key: "staff_helfer", label_de: "Helfer", type: "number", required: false, source: "user", question_hint: "How many helpers were on site?" },
    { key: "equipment", label_de: "Geräte", type: "text", required: false, source: "user", question_hint: "Which equipment was used?" },
    { key: "deliveries", label_de: "Lieferungen", type: "text", required: false, source: "user", question_hint: "Were there any deliveries?" },
    { key: "work_performed", label_de: "Ausgeführte Leistungen", type: "list", required: true, source: "user", question_hint: "What was done today, per schedule item?" },
    { key: "instructions", label_de: "Anordnungen", type: "text", required: false, source: "user", question_hint: "Did you receive any instructions?" },
    { key: "incidents", label_de: "Besondere Vorkommnisse", type: "text", required: false, source: "user", question_hint: "Anything special today?" },
  ],
};
