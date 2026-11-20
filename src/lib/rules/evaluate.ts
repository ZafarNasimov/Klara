// Case evaluation (SPEC §7): missing fields, traffic-light checks with German
// reasons, recipient and deadline. Pure; no LLM. Wording follows the hard rule:
// "Hinweis: … – bitte prüfen", never a legal verdict.
import { berlinDay, computeDeadline, nextWerktag, serializeRule, DEFAULT_HOLIDAY_REGION, type Deadline } from "@/lib/deadlines";
import { hasValue, type DocTypeDef } from "@/lib/doctypes";
import type { CaseFacts, CheckResult, Sphere } from "@/lib/types";
import type { RulesCtx } from "./context";
import { resolveRecipient, type RecipientResult } from "./recipient";

export const CONFIDENCE_THRESHOLD = 0.6;

export type ChannelState = {
  /** When the letter went out (null = not sent yet). */
  sentAt?: string | null;
  /** Delivery confirmed by the mail provider. */
  delivered?: boolean | null;
};

export type EvaluateInput = {
  def: DocTypeDef;
  facts: CaseFacts;
  sphere: Sphere | null;
  /** Classification confidence of the report (null when not from a report). */
  confidence?: number | null;
  /** Drafting time (demo clock). */
  now: Date;
  subcontractorContactId?: string | null;
  channel?: ChannelState;
};

export type Evaluation = {
  missing_fields: string[];
  checks: CheckResult[];
  recipient: RecipientResult;
  deadline: Deadline;
  deadline_rule: string;
  flags: string[];
};

/** Required fields without a value. A field the user could not answer stays missing (amber). */
export function missingFields(def: DocTypeDef, facts: CaseFacts): string[] {
  return def.fields.filter((f) => f.required && !hasValue(facts[f.key])).map((f) => f.key);
}

/** Next field Klara should ask about: required first, then "ask if missing"; max 3 questions per case. */
export function nextQuestionField(def: DocTypeDef, facts: CaseFacts, asked: string[], declined: string[]): string | null {
  if (asked.length >= def.max_questions) return null;
  const open = def.fields.filter(
    (f) => (f.source ?? "user") === "user" && f.ask && !hasValue(facts[f.key]) && !asked.includes(f.key) && !declined.includes(f.key),
  );
  return (open.find((f) => f.required) ?? open.find((f) => f.ask_if_missing))?.key ?? null;
}

/** Instant of the triggering event (falls back to the drafting time). */
export function eventTime(def: DocTypeDef, facts: CaseFacts, now: Date): Date {
  const v = def.event_time_field ? facts[def.event_time_field] : null;
  if (typeof v === "string" && v) {
    // A bare date means "that day"; noon keeps it on the same Berlin day.
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00Z` : v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return now;
}

export function evaluateCase(input: EvaluateInput, ctx: RulesCtx): Evaluation {
  const { def, facts, sphere, now } = input;
  const region = typeof ctx.project.settings.holiday_region === "string" ? ctx.project.settings.holiday_region : DEFAULT_HOLIDAY_REGION;
  const checks: CheckResult[] = [];
  const flags: string[] = [];
  const labelOf = (k: string) => def.fields.find((f) => f.key === k)?.label_de ?? k;
  const missing = missingFields(def, facts);

  const recipient = resolveRecipient(def.recipient, ctx, {
    instructedBy: typeof facts.instructed_by === "string" ? facts.instructed_by : null,
    subcontractorContactId: input.subcontractorContactId,
  });

  for (const id of def.checks) {
    switch (id) {
      case "required_fields":
        checks.push(
          missing.length
            ? { id, label_de: "Pflichtangaben", light: "yellow", reason_de: `Fehlt: ${missing.map(labelOf).join(", ")}` }
            : { id, label_de: "Pflichtangaben", light: "green", reason_de: "Alle Pflichtangaben vorhanden" },
        );
        break;

      case "recipient":
        checks.push(recipient.check);
        break;

      case "timing_unverzueglich": {
        const label_de = "Zeitpunkt";
        if (def.event_time_field && !hasValue(facts[def.event_time_field])) {
          checks.push({ id, label_de, light: "yellow", reason_de: "Zeitpunkt des Ereignisses fehlt" });
          break;
        }
        const evDay = berlinDay(eventTime(def, facts, now));
        const draftDay = berlinDay(now);
        if (draftDay < evDay) {
          checks.push({ id, label_de, light: "green", reason_de: "Vorab angezeigt (erwartetes Ereignis)" });
        } else if (draftDay === evDay) {
          checks.push({ id, label_de, light: "green", reason_de: "Am Tag des Ereignisses erstellt" });
        } else if (draftDay <= nextWerktag(evDay, region)) {
          checks.push({ id, label_de, light: "yellow", reason_de: "Am folgenden Werktag erstellt – heute noch senden" });
        } else {
          checks.push({ id, label_de, light: "red", reason_de: "Mehr als einen Werktag nach dem Ereignis – unverzüglich? Bitte prüfen" });
        }
        break;
      }

      case "timing_mehrkosten": {
        const label_de = "Ankündigung vor Ausführung";
        if (facts.work_started === true) {
          checks.push({ id, label_de, light: "red", reason_de: "Ankündigung vor Ausführung versäumt" });
          flags.push("escalate");
        } else if (facts.work_started === false) {
          checks.push({ id, label_de, light: "green", reason_de: "Arbeiten noch nicht begonnen" });
        } else {
          checks.push({ id, label_de, light: "yellow", reason_de: "Unklar, ob schon begonnen – nachfragen" });
        }
        break;
      }

      case "lv_coverage":
        checks.push(
          facts.in_lv === false
            ? { id, label_de: "Leistungsverzeichnis", light: "green", reason_de: "Nicht im LV enthalten (geprüft)" }
            : { id, label_de: "Leistungsverzeichnis", light: "yellow", reason_de: "Bitte prüfen: im LV enthalten?" },
        );
        break;

      case "sphere":
        checks.push(sphereCheck(sphere, typeof facts._trade === "string" ? facts._trade : null));
        if (sphere === "own_sub" || sphere === "own_team") flags.push("internal_risk");
        break;

      case "channel":
        checks.push(channelCheck(input.channel));
        break;

      case "confidence": {
        const c = input.confidence;
        if (c === null || c === undefined) break;
        const pct = `${Math.round(c * 100)} %`;
        checks.push(
          c >= CONFIDENCE_THRESHOLD
            ? { id, label_de: "Erkennung", light: "green", reason_de: `Meldung eindeutig erkannt (${pct})` }
            : { id, label_de: "Erkennung", light: "yellow", reason_de: `Meldung unsicher erkannt (${pct}) – bitte prüfen` },
        );
        break;
      }
    }
  }

  const deadline = computeDeadline(def.deadline, {
    eventAt: eventTime(def, facts, now),
    now,
    workStart: typeof facts.planned_start === "string" ? facts.planned_start : null,
    workStarted: typeof facts.work_started === "boolean" ? facts.work_started : null,
    holidayRegion: region,
  });

  return { missing_fields: missing, checks, recipient, deadline, deadline_rule: serializeRule(def.deadline), flags };
}

export function sphereCheck(sphere: Sphere | null, trade: string | null = null): CheckResult {
  const id = "sphere";
  const label_de = "Sphäre";
  switch (sphere) {
    case "client":
      return {
        id,
        label_de,
        light: "green",
        reason_de: trade ? `Sphäre des Auftraggebers: ${trade} vom Bauherrn beauftragt` : "Sphäre des Auftraggebers",
      };
    case "weather":
      return {
        id,
        label_de,
        light: "yellow",
        reason_de: "Witterung: nur Bauzeitverlängerung, kein Kostenvorbehalt. Hinweis: gilt nur bei ungewöhnlicher Witterung – bitte prüfen",
      };
    case "unclear":
      return { id, label_de, light: "yellow", reason_de: "Sphäre unklar – bitte klären, wer das Gewerk beauftragt hat" };
    case "own_sub":
      return {
        id,
        label_de,
        light: "red",
        reason_de: "Hinweis: vermutlich eigene Sphäre (eigener Nachunternehmer) – Abhilfe beim Nachunternehmer fordern, bitte prüfen",
      };
    case "own_team":
      return { id, label_de, light: "red", reason_de: "Hinweis: vermutlich eigene Sphäre (eigene Kolonne) – interner Vermerk, bitte prüfen" };
    default:
      return { id, label_de, light: "yellow", reason_de: "Sphäre noch nicht bestimmt" };
  }
}

/** Channel (SPEC §7): green = signed PDF + delivery log; amber = sent without confirmation. */
export function channelCheck(channel: ChannelState | undefined): CheckResult {
  const id = "channel";
  const label_de = "Übermittlung";
  if (!channel?.sentAt) {
    return { id, label_de, light: "green", reason_de: "Schriftlich als PDF per E-Mail mit Zustellprotokoll vorgesehen" };
  }
  return channel.delivered
    ? { id, label_de, light: "green", reason_de: "Als PDF versendet, Zustellung protokolliert" }
    : { id, label_de, light: "yellow", reason_de: "Versendet, Zustellung noch nicht bestätigt" };
}
