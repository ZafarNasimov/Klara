import { handle, readJson } from "@/lib/api";
import { DEFAULT_PROJECT_ID, projectNow } from "@/lib/db/repo";
import { SIMULATED_REPLIES, simulateReply, type SimulatedReply } from "@/lib/mail/inbound";

export const maxDuration = 60;

/**
 * "Antwort simulieren" (SPEC D5): the client answers the latest sent
 * Behinderungsanzeige (or the given case's letter), through the same handler
 * as a real reply. `kind`: rejection (default), request_info or change_request.
 */
export async function POST(req: Request) {
  return handle(async () => {
    type Body = { case_id?: string | null; kind?: string };
    const body = await readJson<Body>(req).catch(() => ({}) as Body);
    const kind = SIMULATED_REPLIES.find((k) => k === body.kind) ?? ("rejection" satisfies SimulatedReply);
    const r = await simulateReply(body.case_id ?? null, await projectNow(DEFAULT_PROJECT_ID), kind);
    return { case_id: r.case?.id ?? null, kind: r.classification.kind, followup_case_id: r.followup?.id ?? null };
  });
}
