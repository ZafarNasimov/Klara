// Which external services are live. Everything degrades to a local mock so
// the app runs without credentials (SPEC: fallbacks must exist).
import "server-only";
export { dataBackend } from "@/lib/db";

export type LlmMode = "live" | "mock";

export function llmMode(): LlmMode {
  const m = process.env.LLM_MODE;
  if (m === "live" || m === "mock") return m;
  return process.env.ANTHROPIC_API_KEY ? "live" : "mock";
}
