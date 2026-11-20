// Which external services are live. Everything degrades to a local mock so
// the app runs without credentials (SPEC: fallbacks must exist).
import "server-only";
export { dataBackend } from "@/lib/db";

export type LlmMode = "live" | "mock";

/**
 * Anthropic settings. `KLARA_ANTHROPIC_*` wins over `ANTHROPIC_*`: hosts that
 * run Claude Code (its cloud environments) reserve the plain names for
 * themselves, so there the app's key and models go under the KLARA_ prefix.
 */
export function anthropicEnv(name: "API_KEY" | "MODEL" | "MODEL_FAST" | "EFFORT"): string | undefined {
  return process.env[`KLARA_ANTHROPIC_${name}`]?.trim() || process.env[`ANTHROPIC_${name}`]?.trim() || undefined;
}

export function llmMode(): LlmMode {
  const m = process.env.LLM_MODE;
  if (m === "live" || m === "mock") return m;
  return anthropicEnv("API_KEY") ? "live" : "mock";
}
