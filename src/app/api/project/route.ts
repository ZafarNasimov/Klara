import { connection } from "next/server";
import { handle } from "@/lib/api";
import { DEFAULT_PROJECT_ID, getProjectContext, projectNow } from "@/lib/db/repo";
import { mailDelivery } from "@/lib/mail/postmark";
import { dataBackend, llmMode } from "@/lib/runtime";

/** Project master data + demo clock + which backends are live. */
export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const id = new URL(req.url).searchParams.get("id") ?? DEFAULT_PROJECT_ID;
    const [ctx, now] = await Promise.all([getProjectContext(id), projectNow(id)]);
    return { ...ctx, now: now.toISOString(), backend: dataBackend(), llm_mode: llmMode(), mail: mailDelivery() };
  });
}
