// Postmark over fetch (SPEC D4): one of the ways Klara sends e-mail (see delivery.ts).
import "server-only";
import { HttpError } from "@/lib/api";
import type { OutgoingMail, SentMail } from "./delivery";

export const postmarkToken = () => process.env.POSTMARK_SERVER_TOKEN?.trim() || null;
export const postmarkFrom = () => process.env.POSTMARK_FROM?.trim() || null;

/** Send one e-mail through Postmark. Throws an HttpError with a German message when Postmark refuses it. */
export async function sendPostmark(mail: OutgoingMail, at: Date): Promise<SentMail> {
  const token = postmarkToken();
  const from = postmarkFrom();
  if (!token) throw new HttpError("Postmark ist nicht eingerichtet (POSTMARK_SERVER_TOKEN fehlt).", 503);
  if (!from) throw new HttpError("E-Mail-Versand ist nicht vollständig eingerichtet (POSTMARK_FROM fehlt).", 503);
  const replyTo = process.env.POSTMARK_REPLY_TO?.trim();
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": token },
    body: JSON.stringify({
      From: from,
      To: mail.to.join(", "),
      ...(mail.cc.length ? { Cc: mail.cc.join(", ") } : {}),
      Subject: mail.subject,
      TextBody: mail.text,
      ...(replyTo ? { ReplyTo: replyTo } : {}),
      Attachments: mail.attachments.map((a) => ({ Name: a.name, Content: a.content.toString("base64"), ContentType: a.contentType })),
      ...(mail.metadata ? { Metadata: mail.metadata } : {}),
      MessageStream: "outbound",
    }),
    signal: AbortSignal.timeout(20_000),
  }).catch((err: unknown) => {
    throw new HttpError(`E-Mail-Server nicht erreichbar (${err instanceof Error ? err.message : "Netzwerkfehler"}).`, 502);
  });
  const out = (await res.json().catch(() => null)) as { MessageID?: string; SubmittedAt?: string; ErrorCode?: number; Message?: string } | null;
  if (!res.ok || !out || out.ErrorCode !== 0 || !out.MessageID) {
    throw new HttpError(`Versand abgelehnt: ${out?.Message ?? `Postmark ${res.status}`}`, 502);
  }
  return { messageId: out.MessageID, submittedAt: out.SubmittedAt ?? at.toISOString(), delivery: "postmark" };
}
