// Document type registry types (SPEC §5). Adding a document type = one config
// file here + one template in lib/documents/templates; the pipeline stays.
// Client-safe: pure data, no server imports.
import type { DeadlineRule } from "@/lib/deadlines";

export type DocTypeId =
  | "behinderungsanzeige"
  | "behinderung_ende"
  | "mehrkostenanzeige"
  | "anordnung_bestaetigung"
  | "stellungnahme_zurueckweisung"
  | "ergaenzung"
  | "bautagesbericht"
  | "verzug_nu"
  | "info_folgegewerk";

export type FieldType = "text" | "datetime" | "date" | "number" | "enum" | "bool" | "list";

/** Pre-written question phrasings: no LLM round trip for en/de/ru (SPEC latency tip). */
export type Phrasings = { en: string; de: string; ru: string };

export type FieldDef = {
  key: string;
  label_de: string;
  type: FieldType;
  required: boolean;
  /** project = auto-filled, never asked; computed = derived by code; user (default) = asked. */
  source?: "project" | "user" | "computed";
  /** What Klara should ask, in plain English (translated for other languages). */
  question_hint: string;
  ask?: Phrasings;
  /** Optional field that Klara still asks for while the question budget lasts. */
  ask_if_missing?: boolean;
  /** German text used in the document when the user does not know. */
  unknown_value_de?: string;
  /** Extraction guidance for the LLM (format, language of the value). */
  extract_hint?: string;
};

export type CheckId =
  | "required_fields"
  | "recipient"
  | "timing_unverzueglich"
  | "timing_mehrkosten"
  | "lv_coverage"
  | "sphere"
  | "channel"
  | "confidence";

export type RecipientKind = "client_with_authority" | "subcontractor" | "internal";

export type DocTypeDef = {
  id: DocTypeId;
  title_de: string;
  /** Shown as info, e.g. "§ 6 Abs. 1 VOB/B". */
  legal_basis: string;
  tier: "A" | "B" | "C";
  build_priority: "must" | "should" | "could";
  recipient: RecipientKind;
  fields: FieldDef[];
  deadline: DeadlineRule;
  /** Fact holding the event time for deadline and timing checks (else: case creation). */
  event_time_field?: string;
  checks: CheckId[];
  max_questions: 3;
  /** Order of facts in Klara's readback. */
  readback_fields: string[];
  /** Short description for the extraction prompt. */
  when_de?: string;
};
