// Thin wrapper around the Anthropic SDK for structured tool output (SPEC §2).
// Model IDs come from env (never hardcoded). Uses forced tool use where the
// model supports it; newer models reject forced tool_choice, so we fall back to
// tool_choice auto + an explicit instruction and validate the result.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export function llmMode(): "live" | "mock" {
  const m = process.env.LLM_MODE;
  if (m === "live" || m === "mock") return m;
  return process.env.ANTHROPIC_API_KEY ? "live" : "mock";
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ timeout: 30_000, maxRetries: 1 });
  return client;
}

export function mainModel(): string {
  const m = process.env.ANTHROPIC_MODEL;
  if (!m) throw new Error("ANTHROPIC_MODEL ist nicht gesetzt (siehe .env.example)");
  return m;
}

export function fastModel(): string {
  return process.env.ANTHROPIC_MODEL_FAST || mainModel();
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

// Models that reject forced tool_choice (learned at runtime too).
const noForcedToolChoice = new Set<string>();
const FORCED_UNSUPPORTED = /^claude-(opus-5-5|sonnet-5-5|fable-5-[12]|mythos-5-[12])/;
// Models that take server-side refusal fallbacks.
const FALLBACK_MODELS = /^claude-(fable-5|opus-5|sonnet-5-5)/;

export class LlmError extends Error {}

export async function callTool<T>(opts: {
  model: string;
  system: string;
  user: string;
  tool: Anthropic.Beta.BetaTool;
  effort?: Effort;
  maxTokens?: number;
}): Promise<T> {
  const forced = !noForcedToolChoice.has(opts.model) && !FORCED_UNSUPPORTED.test(opts.model);
  try {
    return await request<T>(opts, forced);
  } catch (e) {
    if (forced && e instanceof Anthropic.BadRequestError && /tool_choice/i.test(e.message)) {
      noForcedToolChoice.add(opts.model);
      return request<T>(opts, false);
    }
    throw e;
  }
}

async function request<T>(
  opts: { model: string; system: string; user: string; tool: Anthropic.Beta.BetaTool; effort?: Effort; maxTokens?: number },
  forced: boolean,
): Promise<T> {
  const effort = opts.effort ?? ((process.env.ANTHROPIC_EFFORT as Effort) || "low");
  const system = forced
    ? opts.system
    : `${opts.system}\n\nAlways answer by calling the tool \`${opts.tool.name}\` exactly once. Do not reply with plain text.`;

  const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4000,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    tools: [opts.tool],
    tool_choice: forced ? { type: "tool", name: opts.tool.name } : { type: "auto" },
    output_config: { effort },
    messages: [{ role: "user", content: opts.user }],
  };
  if (FALLBACK_MODELS.test(opts.model)) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }

  // Up to two attempts if the model answers without calling the tool.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropic().beta.messages.create(params);
    if (res.stop_reason === "refusal") throw new LlmError("Anfrage vom Modell abgelehnt");
    if (res.stop_reason === "max_tokens") throw new LlmError("Antwort abgeschnitten (max_tokens)");
    const block = res.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === opts.tool.name,
    );
    if (block) return block.input as T;
  }
  throw new LlmError(`Modell hat ${opts.tool.name} nicht aufgerufen`);
}
