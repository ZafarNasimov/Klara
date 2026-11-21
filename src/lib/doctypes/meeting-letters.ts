// Letters that come from meeting notes only (Besprechungen). Their ids are not
// in REPORTABLE_DOC_TYPES, so the call agent's prompt and flow stay unchanged.
import type { DocTypeDef } from "./types";

/** A defect raised in a meeting, addressed to the responsible company. */
export const maengelanzeige: DocTypeDef = {
  id: "maengelanzeige",
  title_de: "Mängelanzeige",
  legal_basis: "§ 4 Abs. 7 VOB/B",
  tier: "B",
  build_priority: "could",
  recipient: "subcontractor",
  deadline: { kind: "unverzueglich" },
  event_time_field: "noticed_at",
  checks: ["required_fields", "recipient", "confidence"],
  max_questions: 3,
  when_de: "Ein Mangel an einer Leistung wurde festgestellt.",
  fields: [
    { key: "noticed_at", label_de: "Festgestellt am", type: "date", required: true, question_hint: "When was the defect noticed?" },
    { key: "defect", label_de: "Mangel", type: "text", required: true, question_hint: "What exactly is the defect?" },
    { key: "area", label_de: "Bereich", type: "text", required: false, unknown_value_de: "nicht angegeben", question_hint: "Where?" },
    { key: "trade", label_de: "Gewerk", type: "text", required: false, unknown_value_de: "nicht angegeben", question_hint: "Which trade?" },
    { key: "source", label_de: "Quelle", type: "text", required: false, source: "computed", question_hint: "" },
  ],
  readback_fields: ["defect", "area", "trade"],
};

/** A concern about the planned execution, raised before the work (§ 4 Abs. 3 VOB/B). */
export const bedenken: DocTypeDef = {
  id: "bedenken",
  title_de: "Bedenkenanzeige",
  legal_basis: "§ 4 Abs. 3 VOB/B",
  tier: "B",
  build_priority: "could",
  recipient: "client_with_authority",
  deadline: { kind: "unverzueglich" },
  event_time_field: "raised_at",
  checks: ["required_fields", "recipient", "confidence"],
  max_questions: 3,
  when_de: "Bedenken gegen die vorgesehene Art der Ausführung, Stoffe oder Vorleistungen anderer.",
  fields: [
    { key: "raised_at", label_de: "Geäußert am", type: "date", required: true, question_hint: "When was the concern raised?" },
    { key: "concern", label_de: "Bedenken", type: "text", required: true, question_hint: "What is the concern?" },
    { key: "area", label_de: "Bereich", type: "text", required: false, unknown_value_de: "nicht angegeben", question_hint: "Where?" },
    { key: "source", label_de: "Quelle", type: "text", required: false, source: "computed", question_hint: "" },
  ],
  readback_fields: ["concern", "area"],
};
