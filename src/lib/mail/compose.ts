// The cover e-mail for a letter (SPEC §8 /admin/mail): subject, recipients and
// a short body. Subject and recipients are deterministic; the body is
// suggested by the fast model and falls back to a fixed German text.
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { callTool, fastModel, llmMode } from "@/lib/agent/llm";
import type { ProjectContext } from "@/lib/db/repo";
import { requireDocType } from "@/lib/doctypes";
import type { DocBody } from "@/lib/documents/types";
import { fmtDate } from "@/lib/labels";
import { resolveRecipient, type RecipientResult } from "@/lib/rules";
import type { Case, Contact } from "@/lib/types";

/** Plain VOB/B bases ("§ 6 Abs. 1 VOB/B") go into the subject; descriptive ones do not. */
const PLAIN_BASIS = /^§ [^;]+ VOB\/B$/;

/** SPEC §8: `{title_de} – BV {project.name} – Zeichen {case.reference}`, e.g. "Behinderungsanzeige gem. § 6 Abs. 1 VOB/B – BV … – Zeichen KL-2026-0042". */
export function mailSubject(c: Pick<Case, "doc_type" | "reference">, projectName: string): string {
  const def = requireDocType(c.doc_type);
  const title = PLAIN_BASIS.test(def.legal_basis) ? `${def.title_de} gem. ${def.legal_basis}` : def.title_de;
  return `${title} – BV ${projectName} – Zeichen ${c.reference}`;
}

/** Same addressee as the letter: the contact with authority, CC the instructing person. */
export function mailRecipients(c: Case, ctx: ProjectContext): RecipientResult {
  const def = requireDocType(c.doc_type);
  return resolveRecipient(def.recipient, ctx, {
    instructedBy: typeof c.facts.instructed_by === "string" ? c.facts.instructed_by : null,
    subcontractorContactId: typeof c.facts._contact_id === "string" ? c.facts._contact_id : null,
  });
}

export const emailsOf = (contacts: (Contact | null)[]) => contacts.map((x) => x?.email?.trim()).filter((x): x is string => !!x);

function signature(ctx: ProjectContext): string {
  const signer = ctx.users.find((u) => u.role === "bauleiter");
  return [signer?.name ?? "Bauleitung", "Bauleitung", ctx.company.name, ctx.company.address].join("\n");
}

const letterDate = (body: DocBody | null) => (body?.date ? fmtDate(`${body.date}T12:00:00Z`) : null);

/** The fixed text: what is attached, a request to confirm receipt, the signature. No legal statements. */
export function fallbackBody(c: Case, body: DocBody | null, ctx: ProjectContext): string {
  const def = requireDocType(c.doc_type);
  const date = letterDate(body);
  return [
    "Sehr geehrte Damen und Herren,",
    `anbei erhalten Sie unser Schreiben „${def.title_de}“${date ? ` vom ${date}` : ""} zum Bauvorhaben ${ctx.project.name} (Zeichen ${c.reference}) als PDF.`,
    "Wir bitten um eine kurze Eingangsbestätigung. Für Rückfragen stehen wir Ihnen gern zur Verfügung.",
    `Mit freundlichen Grüßen\n\n${signature(ctx)}`,
  ].join("\n\n");
}

const BODY_SYSTEM = `You write the short cover e-mail for a formal letter of a German construction company. The letter is attached as PDF; the e-mail only introduces it.

Rules:
- German, formal "Sie", plain text, no markdown.
- Start exactly with "Sehr geehrte Damen und Herren,".
- Then 2 or 3 short sentences: which letter is attached (title, date, Bauvorhaben, reference), the matter in at most one neutral sentence taken from the letter, and a request for a short confirmation of receipt.
- No legal assessment, no claims, no amounts, no deadlines, no paragraphs, nothing the letter does not say.
- End with "Mit freundlichen Grüßen" and nothing after it; code adds the signature.
- Under 90 words.
Call the suggest_email_body tool once with the text.`;

const BODY_TOOL: Anthropic.Tool = {
  name: "suggest_email_body",
  description: "The cover e-mail text, from the salutation to 'Mit freundlichen Grüßen'.",
  input_schema: { type: "object", properties: { body: { type: "string" } }, required: ["body"] },
};

const BODY_TIMEOUT_MS = 8000;

/** The letter's own text, for the model to name the matter. */
function letterText(body: DocBody): string {
  const blocks = body.blocks
    .map((b) => (b.kind === "p" || b.kind === "quote" ? b.text : b.kind === "facts" ? b.rows.map((r) => `${r.label}: ${r.value}`).join("; ") : null))
    .filter(Boolean)
    .join("\n");
  return `Betreff: ${body.subject}\n${blocks}`.slice(0, 2500);
}

/** Accept the model's text only if it keeps the frame; anything else falls back to the fixed text. */
function usable(text: string): boolean {
  const t = text.trim();
  const words = t.split(/\s+/).length;
  return t.startsWith("Sehr geehrte Damen und Herren,") && /Mit freundlichen Grüßen\s*$/.test(t) && words <= 110 && !/§/.test(t);
}

export type BodySuggestion = { body: string; source: "live" | "fallback" | "mock" };

/** AI-suggested body (SPEC §8), editable in the composer. Never blocks drafting: on any problem the fixed text is used. */
export async function suggestBody(c: Case, body: DocBody | null, ctx: ProjectContext): Promise<BodySuggestion> {
  const fixed = fallbackBody(c, body, ctx);
  if (llmMode() !== "live" || !body) return { body: fixed, source: "mock" };
  const def = requireDocType(c.doc_type);
  const user = [
    `Letter title: ${def.title_de}`,
    `Letter date: ${letterDate(body) ?? "unknown"}`,
    `Bauvorhaben: ${ctx.project.name}`,
    `Reference (Zeichen): ${c.reference}`,
    `Letter text:\n${letterText(body)}`,
  ].join("\n");
  const call = callTool<{ body?: unknown }>({ model: fastModel(), system: BODY_SYSTEM, user, tool: BODY_TOOL, maxTokens: 1500, effort: "low" }).then((r) =>
    typeof r.input.body === "string" ? r.input.body.trim() : "",
  );
  const timeout = new Promise<string>((resolve) => setTimeout(() => resolve(""), BODY_TIMEOUT_MS));
  try {
    const text = await Promise.race([call, timeout]);
    if (text && usable(text)) return { body: `${text}\n\n${signature(ctx)}`, source: "live" };
  } catch (err) {
    console.warn("[klara] e-mail body suggestion failed, using the fixed text", err);
  }
  return { body: fixed, source: "fallback" };
}
