// How Klara sends e-mail, first match wins:
//  1. smtp:      a normal mailbox (MAIL_USER + MAIL_PASSWORD, e.g. Gmail with an
//                app password); replies are read back over IMAP (mailbox.ts)
//  2. postmark:  POSTMARK_SERVER_TOKEN; replies arrive at /api/email/inbound
//  3. simulated: nothing leaves the app, the UI says "Testversand"
import "server-only";
import { uid } from "@/lib/db/repo";
import { mailboxConfig, sendSmtp } from "./mailbox";
import { postmarkFrom, postmarkToken, sendPostmark } from "./postmark";

export type Delivery = "smtp" | "postmark" | "simulated";

export type OutgoingMail = {
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  attachments: { name: string; content: Buffer; contentType: string }[];
  /** Klara metadata (case reference). */
  metadata?: Record<string, string>;
};

export type SentMail = { messageId: string; submittedAt: string; delivery: Delivery };

export function mailDelivery(): Delivery {
  if (mailboxConfig()) return "smtp";
  if (postmarkToken()) return "postmark";
  return "simulated";
}

/** The sender as shown in the composer. */
export function mailFrom(): string | null {
  const box = mailboxConfig();
  if (box) return box.fromName ? `${box.fromName} <${box.user}>` : box.user;
  return postmarkFrom();
}

export async function deliver(mail: OutgoingMail, at: Date): Promise<SentMail> {
  const box = mailboxConfig();
  if (box) return sendSmtp(mail, box, at);
  if (postmarkToken()) return sendPostmark(mail, at);
  return { messageId: `sim-${uid()}`, submittedAt: at.toISOString(), delivery: "simulated" };
}
