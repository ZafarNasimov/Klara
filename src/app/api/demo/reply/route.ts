import { handle, readJson } from "@/lib/api";
import { DEFAULT_PROJECT_ID, projectNow } from "@/lib/db/repo";
import { simulateReply } from "@/lib/mail/inbound";

export const maxDuration = 60;

/**
 * "Antwort simulieren" (SPEC D5): the client rejects the latest sent
 * Behinderungsanzeige (or the given case's letter), through the same
 * handler as a real reply.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ case_id?: string | null }>(req).catch(() => ({}) as { case_id?: string | null });
    const r = await simulateReply(body.case_id ?? null, await projectNow(DEFAULT_PROJECT_ID));
    return { case_id: r.case?.id ?? null, kind: r.classification.kind, followup_case_id: r.followup?.id ?? null };
  });
}
