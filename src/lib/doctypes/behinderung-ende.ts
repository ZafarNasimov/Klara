import type { DocTypeDef } from "./types";

export const behinderungEnde: DocTypeDef = {
  id: "behinderung_ende",
  title_de: "Anzeige Wegfall der Behinderung / Wiederaufnahme",
  legal_basis: "§ 6 Abs. 3 VOB/B",
  tier: "A",
  build_priority: "must",
  recipient: "client_with_authority",
  deadline: { kind: "unverzueglich" },
  event_time_field: "end_at",
  checks: ["required_fields", "recipient", "timing_unverzueglich", "channel", "confidence"],
  max_questions: 3,
  when_de: "Eine gemeldete Behinderung ist weggefallen, die Arbeiten laufen wieder.",
  fields: [
    {
      key: "end_at",
      label_de: "Wegfall der Behinderung",
      type: "datetime",
      required: true,
      question_hint: "Since when exactly can you work again? Date and time.",
      ask: {
        en: "Since when exactly can you work again? Date and time, please.",
        de: "Seit wann genau können Sie wieder arbeiten? Bitte Datum und Uhrzeit.",
        ru: "С какого момента точно вы снова можете работать? Дата и время, пожалуйста.",
      },
      extract_hint: "ISO 8601 with offset.",
    },
    {
      key: "resumed_at",
      label_de: "Wiederaufnahme der Arbeiten",
      type: "datetime",
      required: true,
      question_hint: "When did you restart the work?",
      ask: {
        en: "When did your crew restart the work?",
        de: "Wann hat Ihre Kolonne die Arbeit wieder aufgenommen?",
        ru: "Когда ваша бригада снова начала работу?",
      },
      extract_hint: "ISO 8601 with offset. If the user says they restarted right away, same as end_at.",
    },
    {
      key: "still_affected",
      label_de: "Fortwirkende Folgen",
      type: "text",
      required: false,
      unknown_value_de: "keine",
      question_hint: "Is anything still affected?",
      extract_hint: "German, only if stated, e.g. 'Kolonne erst ab Montag wieder vollständig verfügbar'.",
    },
  ],
  readback_fields: ["end_at", "resumed_at", "still_affected"],
};
