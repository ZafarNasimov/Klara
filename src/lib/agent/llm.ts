// Anthropic client for structured extraction (SPEC §2, D10). Model IDs come
// from env. Forced tool use where the model supports it; the newest models
// reject forced tool_choice, so for them we use tool_choice auto plus an
// explicit instruction, and re-ask once if no tool call came back.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicEnv, llmMode } from "@/lib/runtime";
import { timed, timingNote } from "@/lib/timing";

export { llmMode };

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) {
    const apiKey = anthropicEnv("API_KEY");
    if (!apiKey) throw new LlmError("KLARA_ANTHROPIC_API_KEY (oder ANTHROPIC_API_KEY) fehlt");
    client = new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
  }
  return client;
}

export function mainModel(): string {
  const m = anthropicEnv("MODEL");
  if (!m) throw new LlmError("KLARA_ANTHROPIC_MODEL (oder ANTHROPIC_MODEL) fehlt");
  return m;
}

export function fastModel(): string {
  return anthropicEnv("MODEL_FAST") || mainModel();
}

// Models documented to return 400 on tool_choice "tool"/"any".
const NO_FORCED_TOOL = /^claude-(opus-5-5|sonnet-5-5|fable-5-[12]|mythos-5-[12])/;
const forcedRejected = new Set<string>();

function supportsForcedTool(model: string): boolean {
  return !NO_FORCED_TOOL.test(model) && !forcedRejected.has(model);
}

type Effort = "low" | "medium" | "high";

function effortSetting(): Effort | null {
  const e = anthropicEnv("EFFORT");
  return e === "low" || e === "medium" || e === "high" ? e : null;
}

export type ToolCall<T> = { input: T; model: string; usage: Anthropic.Usage };

/** One request that must end in exactly one call of `tool`. */
export async function callTool<T>(opts: {
  model: string;
  system: string;
  user: string;
  tool: Anthropic.Tool;
  maxTokens?: number;
  effort?: Effort | null;
  /** Cache the system prompt + tool (stable across turns). */
  cache?: boolean;
}): Promise<ToolCall<T>> {
  const { model, tool } = opts;
  const effort = opts.effort === undefined ? effortSetting() : opts.effort;
  const forced = supportsForcedTool(model);

  const request = (instruction: string, useForced: boolean) =>
    timed(`llm.${tool.name}`, async () => {
      const msg = await anthropic().messages.create({
        model,
        // Room for adaptive thinking plus the tool call (SPEC: ≥ 2000).
        max_tokens: opts.maxTokens ?? 4000,
        system: [{ type: "text", text: opts.system, ...(opts.cache ? { cache_control: { type: "ephemeral" as const } } : {}) }],
        tools: [tool],
        tool_choice: useForced ? { type: "tool", name: tool.name } : { type: "auto" },
        ...(effort ? { output_config: { effort } } : {}),
        messages: [{ role: "user", content: instruction ? `${opts.user}\n\n${instruction}` : opts.user }],
      });
      const u = msg.usage;
      timingNote(
        `${tool.name}[${model} effort=${effort ?? "default"} in=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} out=${u.output_tokens} stop=${msg.stop_reason}]`,
      );
      return msg;
    });

  let msg: Anthropic.Message;
  try {
    msg = await request(forced ? "" : `Respond only by calling the ${tool.name} tool.`, forced);
  } catch (err) {
    if (forced && err instanceof Anthropic.BadRequestError) {
      // Unknown newer model that rejects forced tool use: remember and retry with auto.
      forcedRejected.add(model);
      msg = await request(`Respond only by calling the ${tool.name} tool.`, false);
    } else {
      throw err;
    }
  }

  for (let attempt = 0; ; attempt++) {
    if (msg.stop_reason === "refusal") throw new LlmError("Das Modell hat die Anfrage abgelehnt");
    if (msg.stop_reason === "max_tokens") throw new LlmError("Antwort des Modells abgeschnitten (max_tokens)");
    const call = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === tool.name);
    if (call) return { input: call.input as T, model, usage: msg.usage };
    if (attempt >= 1) throw new LlmError(`Kein ${tool.name}-Aufruf in der Antwort`);
    msg = await request(`You did not call the tool. Call ${tool.name} now; do not answer in text.`, false);
  }
}
