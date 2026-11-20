// Step 1 of a turn: the LLM (or the mock) reads the utterance.
import "server-only";
import { callTool, llmMode, mainModel } from "./llm";
import { mockExtract } from "./mock";
import { INTENTS, RECORD_TURN_TOOL, SYSTEM_PROMPT } from "./prompt";
import type { ExtractContext, Extraction } from "./types";

function contextMessage(text: string, ctx: ExtractContext): string {
  const parts = [
    `Current date and time (Europe/Berlin): ${ctx.nowBerlin} (${ctx.nowIso})`,
    `Project: ${ctx.projectName}`,
    `Project trades: ${ctx.trades.join(", ")}`,
    `Reporting team: ${ctx.teamName}${ctx.teamTrade ? ` (own trade: ${ctx.teamTrade})` : ""}`,
    ctx.todaysSchedule.length ? `Today's schedule:\n${ctx.todaysSchedule.map((s) => `- ${s}`).join("\n")}` : "",
    ctx.language ? `Language hint from speech recognition: ${ctx.language}` : "",
    ctx.openCases.length
      ? `Open cases in this conversation:\n${ctx.openCases
          .map((c) => `- ${c.reference} ${c.doc_type}: facts=${JSON.stringify(c.facts)} missing=${c.missing.join(",") || "none"}`)
          .join("\n")}`
      : "",
    ctx.pendingQuestion
      ? `Klara just asked about field "${ctx.pendingQuestion.field}" of ${ctx.pendingQuestion.case_ref} (${ctx.pendingQuestion.doc_type}): "${ctx.pendingQuestion.question_hint}"`
      : "",
    ctx.pendingSphereQuestion ? `Klara just asked who hired the ${ctx.pendingSphereQuestion.trade ?? "party causing the hindrance"} (answer_facts.hired_by).` : "",
    ctx.awaitingConfirm ? "Klara just read back a summary and asked whether it is correct." : "",
    ctx.history.length ? `Conversation so far:\n${ctx.history.map((h) => `${h.role === "user" ? "User" : "Klara"}: ${h.text}`).join("\n")}` : "",
    `User's latest utterance:\n"""${text}"""`,
  ];
  return parts.filter(Boolean).join("\n\n");
}

function normalize(raw: Partial<Extraction>): Extraction {
  const intent = INTENTS.includes(raw.intent as never) ? raw.intent! : "smalltalk";
  return {
    intent,
    events: Array.isArray(raw.events)
      ? raw.events
          .filter((e) => e && typeof e.doc_type === "string")
          .map((e) => ({
            ...e,
            facts: e.facts && typeof e.facts === "object" ? e.facts : {},
            confidence: typeof e.confidence === "number" ? e.confidence : 0.5,
          }))
      : [],
    answer_facts: raw.answer_facts && typeof raw.answer_facts === "object" ? raw.answer_facts : {},
    declined_fields: Array.isArray(raw.declined_fields) ? raw.declined_fields : [],
    reply_language: raw.reply_language,
    text_de: raw.text_de,
  };
}

export async function extract(text: string, ctx: ExtractContext): Promise<Extraction> {
  if (llmMode() === "mock") return normalize(mockExtract(text, ctx));
  const raw = await callTool<Partial<Extraction>>({
    model: mainModel(),
    system: SYSTEM_PROMPT,
    user: contextMessage(text, ctx),
    tool: RECORD_TURN_TOOL,
    maxTokens: 4000,
  });
  return normalize(raw);
}
