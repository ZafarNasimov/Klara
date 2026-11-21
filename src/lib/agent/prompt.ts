// Prompts and tool schemas (SPEC §6.2, §6.3). The system prompt is static so
// it can be cached; everything per turn goes into the user message.
import type Anthropic from "@anthropic-ai/sdk";
import { REGISTRY, REPORTABLE_DOC_TYPES, NOT_BUILT_DE, userFields } from "@/lib/doctypes";
import { CAUSE_KINDS, INTENTS, type ExtractContext } from "./types";

const REPORTABLE_BUILT = ["behinderungsanzeige", "behinderung_ende", "mehrkostenanzeige", "anordnung_bestaetigung"] as const;

function fieldCatalog(): string {
  return REPORTABLE_BUILT.map((id) => {
    const def = REGISTRY[id];
    const fields = userFields(def)
      .concat(def.fields.filter((f) => f.key === "verbal"))
      .map((f) => `    - ${f.key} (${f.type}${f.required ? ", required" : ""}): ${f.extract_hint ?? f.question_hint}`)
      .join("\n");
    return `- ${id} – ${def.title_de}. When: ${def.when_de}\n  facts:\n${fields}`;
  }).join("\n");
}

export const SYSTEM_PROMPT = `You are Klara, the assistant of a German construction company. Site foremen (Polier) and site managers report site events to you by voice or chat, in any language. You help document them. Code decides everything legal; you only read the utterance.

Your job on every turn: call the record_turn tool exactly once with what the user said.

Rules:
- Extract only facts the user actually stated. Never infer or invent times, dates, numbers, names or quantities. If unsure, leave the fact out; code will ask.
- Resolve relative times against the current Berlin time given in the message ("since seven" = today 07:00 Europe/Berlin). Datetimes as ISO 8601 with offset, dates as YYYY-MM-DD.
- Write free-text fact values in German, short and factual (they go into German letters). Keep names as said.
- One utterance can contain several events (e.g. a hindrance and a verbal instruction). Split them into separate events.
- trade_name_guess is the trade that CAUSES the problem (e.g. the electricians who did not clear the floor), never the reporting crew's own trade.
- Another trade that did not show up, left early or works too slowly is a hindrance (doc_type behinderungsanzeige, cause_kind trade, trade_name_guess = that trade), even if the user does not say what it blocks. Code decides whether that becomes a letter to the client or a request to our subcontractor.
- cause_kind: trade = another trade blocks the work; client_provision = plans, decisions, approvals, access or material the client owes; weather = storm, rain, frost, heat; own = our own crew, staff, equipment or material; other/unknown otherwise.
- affected_works may be taken from the reporting team's trade when the user speaks of their own crew ("our screed crew" → "Estricharbeiten" plus the area).
- A verbal instruction for extra or changed work is both a mehrkostenanzeige and an anordnung_bestaetigung; set facts.verbal = true.
- If Klara asked a question (see "Pending question"), put the answer under answers with that field key. If the user does not know, put the field key in declined_fields. Corrections of earlier facts also go into answers.
- If Klara read facts back and the user agrees → intent confirm; disagrees → intent deny (put corrections into answers).
- If Klara asked who hired a trade: hired_by = "client" (Bauherr/owner hired them), "us" (we hired them, our subcontractor) or "unknown" (the user does not know).
- Events listed under "Already documented" are finished; never report them again. Only report what is new in this utterance.
- Evening reports with quantities ("screed only 15 m²") → intent diary_answer with progress entries. "Everything according to plan" → intent diary_answer with diary_note.
- confidence (0–1): how sure you are that an event of this type happened as described. Not how plausible, unusual or complete it is: "we cannot work", "N people are waiting" or "X blocks us" is a hindrance (≥ 0.7) whatever the cause (also odd ones like broken site toilets or a falling object), with slang or mixed languages too. Vague or emotional statements without a concrete site event → doc_type none with low confidence.
- reply_language: ISO 639-1 code of the language the user spoke. text_de: German translation of the utterance, or null if it is German.
- Never decide legal outcomes, never promise money, never say a claim is valid or invalid, never mention paragraphs.

Document types you can open (doc_type) and their fact keys:
${fieldCatalog()}
- ${Object.entries(NOT_BUILT_DE)
  .map(([k, v]) => `${k} – ${v}`)
  .join("\n- ")}
- diary_only – site diary note without a letter (normal progress, information)
- none – no recognisable site event`;

export const RECORD_TURN_TOOL: Anthropic.Tool = {
  name: "record_turn",
  description: "Record what the user said in this turn: intent, site events with stated facts, answers to Klara's open question.",
  input_schema: {
    type: "object",
    properties: {
      intent: { type: "string", enum: [...INTENTS] },
      events: {
        type: "array",
        description: "One user utterance may contain several events (e.g. hindrance + verbal instruction). Split them.",
        items: {
          type: "object",
          properties: {
            doc_type: { type: "string", enum: [...REPORTABLE_DOC_TYPES] },
            trade_name_guess: { type: "string", description: "Trade causing the event, as named by the user." },
            cause_kind: { type: "string", enum: [...CAUSE_KINDS] },
            facts: { type: "object", description: "Only facts the user actually said. Never infer times, numbers or names." },
            confidence: { type: "number" },
          },
          required: ["doc_type", "facts", "confidence"],
        },
      },
      answers: { type: "object", description: "Field values answering Klara's pending question or correcting open cases, keyed by field key." },
      declined_fields: { type: "array", items: { type: "string" }, description: "Field keys the user said they do not know." },
      hired_by: { type: "string", enum: ["client", "us", "unknown"] },
      progress: {
        type: "array",
        description: "Quantities performed today, per activity.",
        items: {
          type: "object",
          properties: {
            trade: { type: "string" },
            area: { type: "string" },
            qty: { type: "number" },
            unit: { type: "string" },
            note: { type: "string" },
          },
          required: ["qty"],
        },
      },
      diary_note: { type: "string", description: "German diary note for plain information." },
      reply_language: { type: "string", description: "ISO 639-1 code of the user's language." },
      text_de: { type: "string", description: "German translation of the utterance; omit if German." },
    },
    required: ["intent", "events", "reply_language"],
  },
};

export function buildTurnMessage(text: string, c: ExtractContext): string {
  const lines = [
    `Current time (Europe/Berlin): ${c.nowBerlin} (${c.nowIso})`,
    `Project: ${c.projectName}. Trades on site: ${c.trades.join(", ")}.`,
    `Reporting team: ${c.teamName}${c.teamTrade ? ` (own trade: ${c.teamTrade})` : ""}.`,
    c.todaysSchedule.length ? `Today's schedule:\n${c.todaysSchedule.map((s) => `- ${s}`).join("\n")}` : "Today's schedule: none",
    c.language ? `Language hint: ${c.language}` : "",
    c.openCases.length
      ? `Open cases in this conversation:\n${c.openCases
          .map((o) => `- ${o.reference} ${o.doc_type}: facts ${JSON.stringify(o.facts)}; missing ${o.missing.join(", ") || "nothing"}`)
          .join("\n")}`
      : "Open cases in this conversation: none",
    c.documented.length ? `Already documented: ${c.documented.map((d) => `${d.reference} ${d.doc_type}`).join(", ")}` : "",
    c.pendingQuestion
      ? `Pending question: Klara asked for field "${c.pendingQuestion.field}" of ${c.pendingQuestion.case_ref} (${c.pendingQuestion.doc_type}): "${c.pendingQuestion.question_hint}"`
      : "",
    c.pendingSphereQuestion ? `Pending question: Klara asked who hired the ${c.pendingSphereQuestion.trade ?? "responsible party"} (client or us).` : "",
    c.awaitingConfirm ? "Klara has read the facts back and asked whether they are correct." : "",
    c.history.length ? `Conversation so far:\n${c.history.map((h) => `${h.role === "user" ? "User" : "Klara"}: ${h.text}`).join("\n")}` : "",
    `User says: """${text}"""`,
    "Call record_turn now.",
  ];
  return lines.filter(Boolean).join("\n\n");
}

// ── Phrasing in the user's language (second, small call) ───────────────

export const PHRASE_SYSTEM = `You are Klara, a polite and calm site assistant on a phone call with a construction foreman. Rewrite the given message in the requested language: natural spoken style, short (max 30 words unless facts must be listed), polite, formal address where the language has one. Keep numbers, dates, times and names exactly. German technical values may be translated for understanding. Never add facts, never give legal opinions. Call the say tool with the text.`;

export const SAY_TOOL: Anthropic.Tool = {
  name: "say",
  description: "The sentence(s) Klara says.",
  input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
};
