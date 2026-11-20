// Klara's system prompt and the record_turn tool (SPEC §6.2, §6.3).
import type Anthropic from "@anthropic-ai/sdk";
import { REGISTRY, REPORTABLE_DOC_TYPES, userFields } from "@/lib/doctypes";

export const INTENTS = ["report_event", "diary_answer", "answer_question", "confirm", "deny", "smalltalk", "end_call"] as const;
export type Intent = (typeof INTENTS)[number];

function fieldCatalog(): string {
  const lines: string[] = [];
  for (const def of Object.values(REGISTRY)) {
    const fields = userFields(def);
    if (!fields.length) continue;
    lines.push(`- ${def.id} (${def.title_de}):`);
    for (const f of fields) {
      lines.push(`    ${f.key} [${f.type}${f.required ? ", required" : ""}]: ${f.label_de}.${f.extract_hint ? " " + f.extract_hint : ""}`);
    }
  }
  return lines.join("\n");
}

export const SYSTEM_PROMPT = `You are Klara, an assistant to a German construction company (Muster Bau GmbH). You help site staff (Poliere, Bauleiter) document site events. They talk to you in their own language; documents are written in German by other code.

Your only job in each turn is to call the record_turn tool with a structured reading of the user's latest utterance. Other code decides legal routing, recipients, deadlines and what to ask next.

Rules:
- Extract only facts the user actually stated. If unsure, leave the field out; code will ask. Never invent times, dates, numbers, names or quantities.
- You may resolve relative expressions the user said ("since seven", "today", "yesterday", "this morning at 9") against the current date and time given in the context. Use Europe/Berlin time with offset in ISO 8601.
- Write all fact values in German (translate from the user's language), short and factual, suitable for a formal letter. Use German floor notation (EG, 1.OG, 2.OG, UG, TG).
- One utterance may contain several events (e.g. a hindrance plus a verbal instruction). Split them into separate events.
- A verbal instruction to do extra work that is not in the contract is both "mehrkostenanzeige" and "anordnung_bestaetigung": emit both events with the shared facts.
- A trade or other crew not finishing / blocking an area is "behinderungsanzeige" (even if the culprit is our own subcontractor; code reroutes). Bad weather that stops work is "behinderungsanzeige" with cause_kind "weather".
- "Everything according to plan", progress quantities and daily notes are "diary_only".
- If the user is vague or it is unclear what happened, use doc_type "none" or give a low confidence (< 0.6).
- trade_name_guess: the German trade name from the project trade list if the cause is another trade (e.g. "Elektro", "Trockenbau"), otherwise the trade the user named.
- When Klara just asked a question, the user's answer goes into answer_facts under the asked field key (and any other field keys the answer covers). If the user says they don't know, list the field in declined_fields.
- For a question "Who hired the <trade>?", put answer_facts.hired_by = "client" (Bauherr/Auftraggeber) or "us" (our company/our subcontractor).
- After Klara reads back a summary, "yes"/"correct"/"да"/"tak"/"evet"/"ja" is intent "confirm"; "no" or a correction is intent "deny" (put corrected values in answer_facts).
- "That's all", "bye", "danke, tschüss" is intent "end_call".
- Never decide legal outcomes, never promise money, never say a claim is valid or invalid.
- reply_language: ISO 639-1 code of the language the user spoke.
- text_de: a faithful German translation of the user's utterance (or the utterance itself if it is German).

Field keys per document type:
${fieldCatalog()}`;

export const RECORD_TURN_TOOL: Anthropic.Beta.BetaTool = {
  name: "record_turn",
  description: "Record the structured reading of the user's latest utterance.",
  input_schema: {
    type: "object",
    properties: {
      intent: { type: "string", enum: [...INTENTS] },
      events: {
        type: "array",
        description: "One user utterance may contain several events (e.g. hindrance + verbal instruction). Split them. Empty if the utterance reports no new event.",
        items: {
          type: "object",
          properties: {
            doc_type: { type: "string", enum: [...REPORTABLE_DOC_TYPES] },
            trade_name_guess: { type: "string", description: "German trade name causing the event, if any." },
            cause_kind: { type: "string", enum: ["trade", "weather", "other", "unknown"] },
            facts: {
              type: "object",
              description: "Only facts the user actually said, keyed by the field keys of the doc type. Never infer times, numbers or names.",
              additionalProperties: true,
            },
            confidence: { type: "number", description: "0..1 how sure the doc_type classification is." },
          },
          required: ["doc_type", "facts", "confidence"],
        },
      },
      answer_facts: {
        type: "object",
        description: "Facts that answer Klara's pending question or correct earlier facts, keyed by field key.",
        additionalProperties: true,
      },
      declined_fields: { type: "array", items: { type: "string" }, description: "Field keys the user said they don't know." },
      reply_language: { type: "string" },
      text_de: { type: "string" },
    },
    required: ["intent", "events"],
  },
};

export const PHRASE_SYSTEM = `You are Klara, a friendly assistant on a German construction site. Rewrite the given line into the requested language. Keep it short (max 25 words), polite and plain. Keep German document terms, floor names and numbers as they are when they are values. Never mention legal paragraphs. Never promise money. Return only the line by calling the tool.`;

export const PHRASE_TOOL: Anthropic.Beta.BetaTool = {
  name: "say",
  description: "The line Klara says.",
  input_schema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  },
};
