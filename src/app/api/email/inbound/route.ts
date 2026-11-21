import { timingSafeEqual } from "node:crypto";
import { handle, HttpError } from "@/lib/api";
import { DEFAULT_PROJECT_ID, projectNow } from "@/lib/db/repo";
import { receiveReply, type InboundPayload } from "@/lib/mail/inbound";

// Classification is one model call.
export const maxDuration = 60;

function tokenOk(given: string | null): boolean {
  const expected = process.env.POSTMARK_INBOUND_TOKEN?.trim();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Postmark inbound webhook (SPEC §6.4): `POST /api/email/inbound?token=…`.
 * A wrong or missing token gets 403, which also stops Postmark's retries.
 * A reply without a matching case is still stored (200) for the office.
 */
export async function POST(req: Request) {
  return handle(async () => {
    if (!tokenOk(new URL(req.url).searchParams.get("token"))) throw new HttpError("Nicht berechtigt", 403);
    const payload = (await req.json().catch(() => null)) as InboundPayload | null;
    if (!payload || typeof payload !== "object") throw new HttpError("Erwartet Postmark-Inbound-JSON", 400);
    const r = await receiveReply(payload, await projectNow(DEFAULT_PROJECT_ID));
    return { ok: true, email_in_id: r.email.id, case_id: r.case?.id ?? null, kind: r.classification.kind, followup_case_id: r.followup?.id ?? null, duplicate: r.duplicate };
  });
}
