// Document type registry types (SPEC §5). Adding a doc type = adding a config
// file + template; the pipeline does not change.
import type { DeadlineRule } from "@/lib/deadlines";

export type DocTypeId =
  | "behinderungsanzeige"
  | "behinderung_ende"
  | "mehrkostenanzeige"
  | "anordnung_bestaetigung"
  | "stellungnahme_zurueckweisung"
  | "bautagesbericht"
  | "verzug_nu";

export type FieldType = "text" | "datetime" | "date" | "number" | "enum" | "bool" | "list";

/** Pre-written question phrasings (SPEC latency tip: en/de/ru need no LLM call). */
export type Phrasings = { en: string; de: string; ru: string };

export type FieldDef = {
  key: string;
  label_de: string;
  type: FieldType;
  required: boolean;
  /** project = auto-filled, never asked; computed = derived by code; user = asked. */
  source?: "project" | "user" | "computed";
  /** What Klara should ask, in plain English (the LLM translates for other languages). */
  question_hint: string;
  ask?: Phrasings;
  /** Optional field Klara still asks for while the question budget lasts. */
  ask_if_missing?: boolean;
  /** German text used when the user says they don't know. */
  unknown_value_de?: string;
  /** Short description for the extraction prompt. */
  extract_hint?: string;
};

export type CheckId =
  | "required_fields"
  | "recipient"
  | "timing_unverzueglich"
  | "timing_mehrkosten"
  | "lv_coverage"
  | "sphere"
  | "confidence";

export type RecipientKind = "client_with_authority" | "subcontractor" | "internal";

export type DocTypeDef = {
  id: DocTypeId;
  title_de: string;
  legal_basis: string;
  tier: "A" | "B" | "C";
  build_priority: "must" | "should" | "could";
  recipient: RecipientKind;
  fields: FieldDef[];
  deadline: DeadlineRule;
  /** Which fact gives the event time for the deadline (defaults to case creation). */
  event_time_field?: string;
  checks: CheckId[];
  max_questions: 3;
  /** Short German readback labels are the field labels; this orders them. */
  readback_fields?: string[];
};
