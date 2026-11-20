import type { DocTypeDef } from "./types";

// Own subcontractor caused the problem: no Behinderungsanzeige to the client.
export const verzugNu: DocTypeDef = {
  id: "verzug_nu",
  title_de: "Abhilfeaufforderung an Nachunternehmer",
  legal_basis: "§ 5 Abs. 3–4 VOB/B (NU-Vertrag)",
  tier: "B",
  build_priority: "should",
  recipient: "subcontractor",
  deadline: { kind: "unverzueglich" },
  event_time_field: "start_at",
  checks: ["required_fields", "recipient", "sphere", "confidence"],
  max_questions: 3,
  fields: [
    {
      key: "start_at",
      label_de: "Seit wann",
      type: "datetime",
      required: true,
      source: "user",
      question_hint: "Since when exactly? Date and time.",
      ask: {
        en: "Since when exactly? Date and time, please.",
        de: "Seit wann genau? Bitte Datum und Uhrzeit.",
        ru: "С какого момента точно? Дата и время, пожалуйста.",
      },
      extract_hint: "ISO 8601 datetime with offset.",
    },
    {
      key: "area",
      label_de: "Bereich",
      type: "text",
      required: true,
      source: "user",
      question_hint: "Where exactly (floor/section)?",
      ask: {
        en: "Where exactly is it, which floor or section?",
        de: "Wo genau, welches Geschoss oder welcher Abschnitt?",
        ru: "Где именно, какой этаж или участок?",
      },
    },
    {
      key: "cause",
      label_de: "Sachverhalt",
      type: "text",
      required: true,
      source: "user",
      question_hint: "What exactly happened?",
      ask: {
        en: "What exactly happened?",
        de: "Was genau ist passiert?",
        ru: "Что именно произошло?",
      },
    },
    {
      key: "affected_works",
      label_de: "Betroffene Leistungen",
      type: "text",
      required: false,
      source: "user",
      question_hint: "Which works are affected?",
    },
    {
      key: "idle_staff",
      label_de: "Arbeitskräfte ohne Einsatz",
      type: "number",
      required: false,
      source: "user",
      question_hint: "How many people are standing idle?",
    },
  ],
  readback_fields: ["start_at", "area", "cause", "affected_works", "idle_staff"],
};
