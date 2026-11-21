import type { DocTypeDef } from "./types";

export const anordnungBestaetigung: DocTypeDef = {
  id: "anordnung_bestaetigung",
  // Neutral: verbal instructions from site, and written ones from the client's e-mail (SPEC §6.4).
  // The letter's own subject says which ("Bestätigung einer mündlichen Anordnung" / "Bestätigung Ihrer Anordnung").
  title_de: "Bestätigung einer Anordnung",
  legal_basis: "VOB/B: Beweissicherung; BGB: § 650b Abs. 2 (Textform)",
  tier: "A",
  build_priority: "must",
  recipient: "client_with_authority",
  // Practice: confirm the same day.
  deadline: { kind: "unverzueglich" },
  event_time_field: "instruction_date",
  checks: ["required_fields", "recipient", "timing_unverzueglich", "channel", "confidence"],
  max_questions: 3,
  when_de: "Jemand hat auf der Baustelle mündlich eine Anordnung erteilt (geänderte oder zusätzliche Leistung, Reihenfolge, Termine).",
  fields: [
    {
      key: "instruction_date",
      label_de: "Datum der Anordnung",
      type: "date",
      required: true,
      question_hint: "When was this requested? Date.",
      ask: {
        en: "When was this requested, today or another day?",
        de: "Wann wurde das angeordnet, heute oder an einem anderen Tag?",
        ru: "Когда это поручили, сегодня или в другой день?",
      },
      extract_hint: "YYYY-MM-DD resolved against today. Only if stated.",
    },
    {
      key: "instruction_time",
      label_de: "Uhrzeit",
      type: "text",
      required: false,
      question_hint: "At about what time?",
      extract_hint: "HH:MM, only if stated.",
    },
    {
      key: "place",
      label_de: "Ort",
      type: "text",
      required: false,
      unknown_value_de: "auf der Baustelle",
      question_hint: "Where on site?",
      extract_hint: "German, e.g. '2.OG, Treppenhaus Nord'.",
    },
    {
      key: "instructed_by",
      label_de: "Angeordnet durch",
      type: "text",
      required: true,
      question_hint: "Who gave the instruction, and what is their role?",
      ask: {
        en: "Who gave the instruction, and in what role?",
        de: "Wer hat die Anordnung erteilt, und in welcher Funktion?",
        ru: "Кто дал указание и в какой должности?",
      },
      extract_hint: "'Name (Rolle)', e.g. 'Thomas Weber (Architekt)'.",
    },
    {
      key: "instruction_text",
      label_de: "Wortlaut der Anordnung",
      type: "text",
      required: true,
      question_hint: "What exactly was said? As literally as possible.",
      ask: {
        en: "What exactly was said? As word for word as you can.",
        de: "Was genau wurde gesagt? Möglichst wörtlich.",
        ru: "Что именно было сказано? Как можно дословнее.",
      },
      extract_hint: "German, as literal as possible, e.g. 'Bauen Sie im 2.OG drei zusätzliche Brandschutztüren T30 ein.'",
    },
    {
      key: "witnesses",
      label_de: "Anwesend",
      type: "text",
      required: false,
      unknown_value_de: "keine weiteren Personen benannt",
      question_hint: "Who else was present?",
      extract_hint: "Names, only if stated.",
    },
  ],
  readback_fields: ["instructed_by", "instruction_date", "instruction_time", "place", "instruction_text", "witnesses"],
};
