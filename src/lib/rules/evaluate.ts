// Case evaluation: missing fields, traffic-light checks (each with a German
// reason), sphere, recipient and deadline. Pure; no LLM.
import { berlinDay, computeDeadline, nextWerktag, describeRule, type Deadline } from "@/lib/deadlines";
import { hasValue, userFields, type DocTypeDef } from "@/lib/doctypes";
import { SPHERE_DE } from "@/lib/labels";
import type { CaseFacts, CheckResult, Sphere } from "@/lib/types";
import type { RulesCtx } from "./context";
import { resolveRecipient, type RecipientResult } from "./recipient";

export const CONFIDENCE_THRESHOLD = 0.6;

export type EvaluateInput = {
  def: DocTypeDef;
  facts: CaseFacts;
  sphere: Sphere | null;
  declinedFields?: string[];
  confidence?: number | null;
  /** When the case/document was drafted (demo clock). */
  now: Date;
  subcontractorContactId?: string | null;
};

export type Evaluation = {
  missing_fields: string[];
  checks: CheckResult[];
  recipient: RecipientResult;
  deadline: Deadline;
  deadline_rule: string;
  flags: string[];
};

export function missingFields(def: DocTypeDef, facts: CaseFacts): string[] {
  // A required field the user could not answer stays missing (yellow), it is just not asked again.
  return def.fields.filter((f) => f.required && !hasValue(facts[f.key])).map((f) => f.key);
}

/** Next field Klara should ask about, honoring the 3-question budget. */
export function nextQuestionField(
  def: DocTypeDef,
  facts: CaseFacts,
  asked: string[],
  declined: string[],
): string | null {
  if (asked.length >= def.max_questions) return null;
  const candidates = userFields(def).filter(
    (f) => !hasValue(facts[f.key]) && !asked.includes(f.key) && !declined.includes(f.key) && f.ask,
  );
  const required = candidates.find((f) => f.required);
  if (required) return required.key;
  const optional = candidates.find((f) => f.ask_if_missing);
  return optional?.key ?? null;
}

function eventTime(def: DocTypeDef, facts: CaseFacts, now: Date): Date {
  const v = def.event_time_field ? facts[def.event_time_field] : null;
  if (typeof v === "string" && v) {
    const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return now;
}

export function evaluateCase(input: EvaluateInput, ctx: RulesCtx): Evaluation {
  const { def, facts, sphere, now } = input;
  const checks: CheckResult[] = [];
  const flags: string[] = [];
  const labelOf = (k: string) => def.fields.find((f) => f.key === k)?.label_de ?? k;

  const missing = missingFields(def, facts);

  for (const id of def.checks) {
    switch (id) {
      case "required_fields":
        checks.push(
          missing.length
            ? { id, label_de: "Pflichtangaben", light: "yellow", reason_de: `Fehlt: ${missing.map(labelOf).join(", ")}` }
            : { id, label_de: "Pflichtangaben", light: "green", reason_de: "Alle Pflichtangaben vorhanden" },
        );
        break;

      case "timing_unverzueglich": {
        const ev = def.event_time_field ? facts[def.event_time_field] : null;
        if (!hasValue(ev)) {
          checks.push({ id, label_de: "Zeitpunkt", light: "yellow", reason_de: "Zeitpunkt des Ereignisses unbekannt" });
          break;
        }
        const evDay = berlinDay(eventTime(def, facts, now));
        const today = berlinDay(now);
        if (today <= evDay) {
          checks.push({ id, label_de: "Zeitpunkt", light: "green", reason_de: "Am Tag des Ereignisses erstellt" });
        } else if (today <= nextWerktag(evDay)) {
          checks.push({ id, label_de: "Zeitpunkt", light: "yellow", reason_de: "Am folgenden Werktag erstellt" });
        } else {
          checks.push({
            id,
            label_de: "Zeitpunkt",
            light: "red",
            reason_de: "Mehr als einen Werktag nach dem Ereignis – unverzüglich? Bitte prüfen",
          });
        }
        break;
      }

      case "timing_mehrkosten": {
        const ws = facts.work_started;
        if (ws === true) {
          checks.push({ id, label_de: "Ankündigung vor Ausführung", light: "red", reason_de: "Ankündigung vor Ausführung versäumt" });
          flags.push("escalate");
        } else if (ws === false) {
          checks.push({ id, label_de: "Ankündigung vor Ausführung", light: "green", reason_de: "Arbeiten noch nicht begonnen" });
        } else {
          checks.push({ id, label_de: "Ankündigung vor Ausführung", light: "yellow", reason_de: "Unklar, ob bereits begonnen – nachfragen" });
        }
        break;
      }

      case "lv_coverage":
        checks.push(
          facts.in_lv === false
            ? { id, label_de: "Leistungsverzeichnis", light: "green", reason_de: "Nicht im LV enthalten (bestätigt)" }
            : { id, label_de: "Leistungsverzeichnis", light: "yellow", reason_de: "Bitte prüfen: im LV enthalten?" },
        );
        break;

      case "sphere":
        checks.push(sphereCheck(sphere));
        if (sphere === "own_sub" || sphere === "own_team") flags.push("internal_risk");
        break;

      case "confidence": {
        const c = input.confidence;
        if (c == null) break;
        checks.push(
          c >= CONFIDENCE_THRESHOLD
            ? { id, label_de: "Erkennung", light: "green", reason_de: `Meldung eindeutig erkannt (${Math.round(c * 100)} %)` }
            : { id, label_de: "Erkennung", light: "yellow", reason_de: `Meldung unsicher erkannt (${Math.round(c * 100)} %) – bitte prüfen` },
        );
        break;
      }

      case "recipient":
        break; // added below
    }
  }

  const recipient = resolveRecipient(def.recipient, ctx, {
    instructedBy: typeof facts.instructed_by === "string" ? facts.instructed_by : null,
    subcontractorContactId: input.subcontractorContactId,
  });
  if (def.checks.includes("recipient")) checks.splice(1, 0, recipient.check);

  const workStart = typeof facts.planned_start === "string" ? facts.planned_start : null;
  const deadline = computeDeadline(def.deadline, {
    eventAt: eventTime(def, facts, now),
    now,
    workStart,
    holidayRegion: typeof ctx.project.settings.holiday_region === "string" ? ctx.project.settings.holiday_region : undefined,
  });

  return { missing_fields: missing, checks, recipient, deadline, deadline_rule: describeRule(def.deadline), flags };
}

export function sphereCheck(sphere: Sphere | null): CheckResult {
  const id = "sphere";
  const label_de = "Sphäre";
  switch (sphere) {
    case "client":
      return { id, label_de, light: "green", reason_de: "Sphäre des Auftraggebers (Gewerk vom Bauherrn beauftragt)" };
    case "weather":
      return {
        id,
        label_de,
        light: "yellow",
        reason_de:
          "Witterung: nur Bauzeitverlängerung, kein Kostenvorbehalt. Hinweis: gilt nur bei ungewöhnlicher Witterung – bitte prüfen",
      };
    case "unclear":
      return { id, label_de, light: "yellow", reason_de: "Sphäre unklar – Beauftragung des Gewerks bitte klären" };
    case "own_sub":
      return { id, label_de, light: "red", reason_de: `Hinweis: vermutlich eigene Sphäre (${SPHERE_DE.own_sub}) – kein Anspruch gegen den Bauherrn, NU in Verzug setzen` };
    case "own_team":
      return { id, label_de, light: "red", reason_de: `Hinweis: vermutlich eigene Sphäre (${SPHERE_DE.own_team}) – interner Vermerk statt Anzeige` };
    default:
      return { id, label_de, light: "yellow", reason_de: "Sphäre noch nicht bestimmt" };
  }
}
