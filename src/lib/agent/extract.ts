// Reads one user utterance into an Extraction (SPEC §6.2). Live: Claude with the
// record_turn tool. Without a key, or if the live call fails, the keyword mock
// takes over so the demo never stalls. Output is validated here; nothing the
// model returns reaches the rules engine unchecked.
import "server-only";
import { berlinDay } from "@/lib/deadlines";
import { getDocType, hasValue, REPORTABLE_DOC_TYPES, type FieldDef, type ReportableDocType } from "@/lib/doctypes";
import type { CauseKind } from "@/lib/rules/sphere";
import { callTool, llmMode, mainModel } from "./llm";
import { guessLanguage, mockExtract } from "./mock";
import { buildTurnMessage, RECORD_TURN_TOOL, SYSTEM_PROMPT } from "./prompt";
import { CAUSE_KINDS, INTENTS, type ExtractContext, type ExtractedEvent, type Extraction, type Intent, type ProgressReport } from "./types";

export type ExtractSource = "live" | "mock" | "fallback";

export type ExtractResult = { extraction: Extraction; source: ExtractSource; model: string | null };

export async function extract(text: string, ctx: ExtractContext): Promise<ExtractResult> {
  if (llmMode() !== "live") return { extraction: mockExtract(text, ctx), source: "mock", model: null };
  try {
    const r = await callTool<unknown>({
      model: mainModel(),
      system: SYSTEM_PROMPT,
      user: buildTurnMessage(text, ctx),
      tool: RECORD_TURN_TOOL,
      cache: true,
    });
    const extraction = sanitizeExtraction(r.input, text, ctx);
    // Opt-in diagnosis of real conversations (contains what the user said; off by default).
    if (process.env.KLARA_LOG_EXTRACT === "1") {
      const brief = extraction.events.map((e) => ({ doc_type: e.doc_type, confidence: e.confidence, cause_kind: e.cause_kind, trade: e.trade_name_guess, facts: e.facts }));
      console.log("[klara] extract", JSON.stringify({ intent: extraction.intent, events: brief, diary_note: extraction.diary_note }));
    }
    return { extraction, source: "live", model: r.model };
  } catch (err) {
    console.warn("[klara] extraction failed, using keyword fallback", err);
    return { extraction: mockExtract(text, ctx), source: "fallback", model: null };
  }
}

// ── Validation ────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Coerce a value to the field's type; null when it does not fit (the field then stays missing). */
export function normalizeValue(f: Pick<FieldDef, "type">, v: unknown): unknown {
  if (v === undefined || v === null) return null;
  switch (f.type) {
    case "datetime": {
      if (typeof v !== "string") return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    case "date": {
      if (typeof v !== "string") return null;
      const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : berlinDay(d);
    }
    case "number": {
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/\s/g, "").replace(",", ".")) : NaN;
      return Number.isFinite(n) ? n : null;
    }
    case "bool": {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") {
        if (/^(true|ja|yes|да)$/i.test(v.trim())) return true;
        if (/^(false|nein|no|нет)$/i.test(v.trim())) return false;
      }
      return null;
    }
    case "list": {
      const arr = Array.isArray(v) ? v : [v];
      const out = arr.map((x) => (typeof x === "number" ? String(x) : str(x))).filter((x): x is string => !!x);
      return out.length ? out : null;
    }
    default:
      if (typeof v === "number") return String(v);
      return str(v);
  }
}

/** Keep only known, well-typed facts of a doc type. Internal keys (_…) are never accepted from the model. */
export function normalizeFacts(docType: string, facts: unknown): Record<string, unknown> {
  if (!isObj(facts)) return {};
  const def = getDocType(docType);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(facts)) {
    if (k.startsWith("_")) continue;
    const f = def?.fields.find((x) => x.key === k);
    // Types without a template keep plain text facts for the office note.
    const val = f ? normalizeValue(f, v) : def ? null : normalizeValue({ type: "text" }, v);
    if (hasValue(val)) out[k] = val;
  }
  return out;
}

function fieldFor(key: string, ctx: ExtractContext): FieldDef | null {
  const types = [ctx.pendingQuestion?.doc_type, ...ctx.openCases.map((c) => c.doc_type)].filter((x): x is string => !!x);
  for (const t of types) {
    const f = getDocType(t)?.fields.find((x) => x.key === key);
    if (f) return f;
  }
  return null;
}

function sanitizeEvent(e: unknown): ExtractedEvent | null {
  if (!isObj(e)) return null;
  const doc_type = (REPORTABLE_DOC_TYPES as readonly string[]).includes(String(e.doc_type)) ? (e.doc_type as ReportableDocType) : null;
  if (!doc_type) return null;
  const cause_kind = (CAUSE_KINDS as readonly string[]).includes(String(e.cause_kind)) ? (e.cause_kind as CauseKind) : "unknown";
  const c = typeof e.confidence === "number" && Number.isFinite(e.confidence) ? Math.min(1, Math.max(0, e.confidence)) : 0.5;
  return { doc_type, trade_name_guess: str(e.trade_name_guess), cause_kind, facts: normalizeFacts(doc_type, e.facts), confidence: c };
}

function sanitizeProgress(p: unknown): ProgressReport | null {
  if (!isObj(p)) return null;
  const qty = typeof p.qty === "number" ? p.qty : Number(p.qty);
  if (!Number.isFinite(qty) || qty < 0) return null;
  return { trade: str(p.trade), area: str(p.area), qty, unit: str(p.unit), note: str(p.note) };
}

export function sanitizeExtraction(raw: unknown, text: string, ctx: ExtractContext): Extraction {
  const r = isObj(raw) ? raw : {};
  const events = (Array.isArray(r.events) ? r.events : []).map(sanitizeEvent).filter((e): e is ExtractedEvent => !!e);

  const answers: Record<string, unknown> = {};
  if (isObj(r.answers)) {
    for (const [k, v] of Object.entries(r.answers)) {
      if (k.startsWith("_")) continue;
      const f = fieldFor(k, ctx);
      if (!f) continue;
      const val = normalizeValue(f, v);
      if (hasValue(val)) answers[k] = val;
    }
  }
  const declined = (Array.isArray(r.declined_fields) ? r.declined_fields : []).filter(
    (k): k is string => typeof k === "string" && !!fieldFor(k, ctx),
  );
  const progress = (Array.isArray(r.progress) ? r.progress : []).map(sanitizeProgress).filter((p): p is ProgressReport => !!p);

  let intent: Intent = (INTENTS as readonly string[]).includes(String(r.intent)) ? (r.intent as Intent) : events.length ? "report_event" : "smalltalk";
  // Confirm/deny only make sense right after a readback.
  if ((intent === "confirm" || intent === "deny") && !ctx.awaitingConfirm) intent = events.length ? "report_event" : "answer_question";

  const lang = str(r.reply_language)?.toLowerCase().slice(0, 2) ?? (ctx.language && ctx.language !== "auto" ? ctx.language : guessLanguage(text));
  const hired = r.hired_by === "client" || r.hired_by === "us" || r.hired_by === "unknown" ? r.hired_by : null;

  return {
    intent,
    events,
    answers,
    declined_fields: declined,
    hired_by: hired,
    progress,
    diary_note: str(r.diary_note),
    reply_language: /^[a-z]{2}$/.test(lang) ? lang : "en",
    text_de: lang === "de" ? null : str(r.text_de),
  };
}
