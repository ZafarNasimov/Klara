import { connection } from "next/server";
import { handle } from "@/lib/api";
import { DEFAULT_PROJECT_ID, getProjectContext, listProjects, projectNow } from "@/lib/db/repo";
import { mailDelivery } from "@/lib/mail/delivery";
import { dataBackend, llmMode } from "@/lib/runtime";

/** Project master data + demo clock + which backends are live. */
export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const id = new URL(req.url).searchParams.get("id") ?? DEFAULT_PROJECT_ID;
    const [ctx, now, all] = await Promise.all([getProjectContext(id), projectNow(id), listProjects()]);
    const projects = all.map((p) => ({ id: p.id, name: p.name, contract_type: p.contract_type, contract_no: p.contract_no }));
    return { ...ctx, projects, now: now.toISOString(), backend: dataBackend(), llm_mode: llmMode(), mail: mailDelivery() };
  });
}
