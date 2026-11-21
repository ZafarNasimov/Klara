// Postmark over fetch (SPEC D4): outbound e-mail with the letter attached.
// Without POSTMARK_SERVER_TOKEN nothing leaves the app: "send" is simulated
// with a local message id, and the UI says so.
import "server-only";
import { HttpError } from "@/lib/api";
import { uid } from "@/lib/db/repo";

export type Delivery = "postmark" | "simulated";

export function mailDelivery(): Delivery {
  return process.env.POSTMARK_SERVER_TOKEN?.trim() ? "postmark" : "simulated";
}

/** Sender shown in the composer; Postmark needs a confirmed sender signature for it. */
export function mailFrom(): string | null {
  return process.env.POSTMARK_FROM?.trim() || null;
}

export type OutgoingMail = {
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  attachments: { name: string; content: Buffer; contentType: string }[];
  /** Klara metadata (case reference); Postmark returns it in webhooks. */
  metadata?: Record<string, string>;
};

export type SentMail = { messageId: string; submittedAt: string; delivery: Delivery };

/** Send one e-mail. Throws an HttpError with a German message when Postmark refuses it. */
export async function deliver(mail: OutgoingMail, at: Date): Promise<SentMail> {
  const token = process.env.POSTMARK_SERVER_TOKEN?.trim();
  if (!token) return { messageId: `sim-${uid()}`, submittedAt: at.toISOString(), delivery: "simulated" };

  const from = mailFrom();
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
