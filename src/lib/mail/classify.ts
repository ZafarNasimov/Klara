// Reply analysis (SPEC §6.4 step 3): what does the client's answer mean?
// Live: Claude with the classify_reply tool. Without a key, or when the live
// call fails, German keywords decide, so "Antwort simulieren" always works.
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { callTool, llmMode, mainModel } from "@/lib/agent/llm";
import { REPLY_KIND_DE } from "@/lib/labels";
import type { ReplyClassification, ReplyKind } from "@/lib/types";

export const REPLY_KINDS: ReplyKind[] = ["acceptance", "rejection", "request_info", "counter_instruction", "change_request", "other"];

/** Sentences of a plain-text mail, without greeting, closing, signature and quoted history. */
export function replySentences(text: string): string[] {
  const body = text
    .split(/\n(?:-{2,}|_{2,}|Am .{5,120} schrieb|On .{5,120} wrote|Von: |From: |-----Original)/)[0]
    .split(/\n\s*(?:Mit freundlichen Grüßen|Freundliche Grüße|Viele Grüße|Beste Grüße|MfG)\b/i)[0]
    .split("\n")
    .filter((l) => !/^\s*>/.test(l) && !/^\s*(Sehr geehrte|Hallo|Guten Tag)\b/i.test(l))
    .join(" ");
  return body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 3);
}

const RULES: { kind: ReplyKind; re: RegExp }[] = [
  { kind: "rejection", re: /zurückwei|zurückgewiesen|weisen\b.{0,80}\bzurück|lehnen\b.{0,80}\bab\b|abgelehnt|nicht anerkannt|erkennen\b.{0,60}\bnicht an|unbegründet|widersprechen/i },
  { kind: "request_info", re: /\bbitte\b.{0,60}\b(um|senden|übersenden|übermitteln|nachreichen|vorlegen|ergänzen)\b|benötigen\b|fehlende? (unterlagen|angaben|nachweise)|rückfrage/i },
  { kind: "counter_instruction", re: /ordnen\b.{0,60}\ban\b|weisen\b.{0,40}\ban\b|anweisung|haben\b.{0,40}\bzu unterlassen/i },
  { kind: "change_request", re: /änderung|ändern|stattdessen|abweichend|zusätzlich/i },
  { kind: "acceptance", re: /eingang\b.{0,40}\bbestätig|bestätigen\b.{0,40}\beingang|zur kenntnis genommen|einverstanden|anerkannt|erkennen\b.{0,60}\ban\b|akzeptier|stimmen\b.{0,40}\bzu\b/i },
];

/** The keyword reader: first matching rule wins (a rejection beats "anerkannt" in "nicht anerkannt"). */
export function classifyByKeywords(subject: string, text: string): ReplyClassification {
  const sentences = replySentences(text);
  const all = `${subject}\n${sentences.join(" ")}`;
  const kind = RULES.find((r) => r.re.test(all))?.kind ?? "other";
  // The core of the answer: the first sentence that gives a reason, not the one that only says "we reject".
  const rule = RULES.find((r) => r.kind === kind)?.re;
  const reasons = sentences.filter((s) => !rule || !rule.test(s));
  const key = (reasons.length ? reasons : sentences).slice(0, 3);
  const requested = kind === "request_info" ? sentences.filter((s) => RULES[1].re.test(s)).slice(0, 3) : [];
  return {
    kind,
    summary_de: sentences[0] ? `${REPLY_KIND_DE[kind]}: ${sentences[0]}` : REPLY_KIND_DE[kind],
    key_points: key,
    requested_items: requested,
    quote: key[0] ?? null,
    source: "mock",
  };
}

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

/**
 * The client's own sentence behind a key point, verbatim (the model may
 * paraphrase; quotation marks in a legal context must hold the real words).
 * Null when no sentence carries at least 60 % of the key point's words.
 */
export function verbatimQuote(keyPoint: string | undefined, text: string): string | null {
  if (!keyPoint) return null;
  const want = words(keyPoint);
  if (!want.size) return null;
  let best: { s: string; score: number } | null = null;
  for (const s of replySentences(text)) {
    const have = words(s);
    const score = [...want].filter((w) => have.has(w)).length / want.size;
    if (!best || score > best.score) best = { s, score };
  }
  return best && best.score >= 0.6 ? best.s : null;
}

const SYSTEM = `You read a reply e-mail that a German client (Auftraggeber), architect or subcontractor sent to a construction contractor about one of the contractor's formal letters. Call the classify_reply tool exactly once.

kind:
- acceptance: they accept, acknowledge or confirm receipt without objection
- rejection: they reject or dispute the letter (e.g. "wir weisen Ihre Behinderungsanzeige zurück")
- request_info: they ask for information, documents or evidence
- counter_instruction: they give a new or different instruction
- change_request: they request a change of the works
- other: anything else

summary_de: one neutral German sentence about what they say.
key_points: their reasons or statements, in German, max 3, each at most one sentence, as close to their words as possible. Put the main reason first (not the bare "we reject").
requested_items: what they ask the contractor to provide (empty unless request_info).
Never judge whether they are right. Never add legal assessments.`;

const TOOL: Anthropic.Tool = {
  name: "classify_reply",
  description: "Classify the reply and extract its core statements.",
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: REPLY_KINDS },
      summary_de: { type: "string" },
      key_points: { type: "array", items: { type: "string" } },
      requested_items: { type: "array", items: { type: "string" } },
    },
    required: ["kind", "summary_de", "key_points", "requested_items"],
  },
};

const strings = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()).slice(0, max);

export async function classifyReply(input: { subject: string; text: string; letterTitle: string | null; reference: string | null }): Promise<ReplyClassification> {
  const fallback = classifyByKeywords(input.subject, input.text);
  if (llmMode() !== "live") return fallback;
  try {
    const r = await callTool<Record<string, unknown>>({
      model: mainModel(),
      system: SYSTEM,
      user: [
        `Our letter: ${input.letterTitle ?? "unknown"}${input.reference ? ` (Zeichen ${input.reference})` : ""}`,
        `Reply subject: ${input.subject}`,
        `Reply text:\n"""${input.text.slice(0, 6000)}"""`,
      ].join("\n"),
      tool: TOOL,
      maxTokens: 2000,
      effort: "low",
    });
    const kind = REPLY_KINDS.includes(r.input.kind as ReplyKind) ? (r.input.kind as ReplyKind) : "other";
    const summary = typeof r.input.summary_de === "string" && r.input.summary_de.trim() ? r.input.summary_de.trim() : fallback.summary_de;
    const keyPoints = strings(r.input.key_points, 3);
    return {
      kind,
      summary_de: summary,
      key_points: keyPoints,
      requested_items: strings(r.input.requested_items, 5),
      quote: verbatimQuote(keyPoints[0], input.text),
      source: "live",
    };
  } catch (err) {
    console.warn("[klara] reply classification failed, using keywords", err);
    return { ...fallback, source: "fallback" };
  }
}
