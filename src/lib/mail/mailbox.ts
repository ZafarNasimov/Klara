// A normal mailbox as Klara's mail channel: SMTP to send the letter, IMAP to
// read the client's answer. Gmail works with an app password (2-Step
// Verification on) and needs no host settings; other providers set
// MAIL_SMTP_HOST / MAIL_IMAP_HOST (ports default to 465 and 993, TLS).
import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { HttpError } from "@/lib/api";
import { store } from "@/lib/db";
import { uid } from "@/lib/db/repo";
import { stripQuoted } from "./classify";
import type { OutgoingMail, SentMail } from "./delivery";
import { receiveReply } from "./inbound";

export type MailboxConfig = {
  user: string;
  pass: string;
  fromName: string | null;
  smtp: { host: string; port: number };
  imap: { host: string; port: number };
};

const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/** The mailbox from MAIL_* env vars, or null when none is configured. */
export function mailboxConfig(): MailboxConfig | null {
  const user = process.env.MAIL_USER?.trim();
  const raw = process.env.MAIL_PASSWORD ?? "";
  if (!user || !raw.trim()) return null;
  const gmail = GMAIL.has(user.split("@")[1]?.toLowerCase() ?? "");
  // Google shows app passwords in groups of four ("abcd efgh …"); the spaces are not part of it.
  const pass = gmail ? raw.replace(/\s+/g, "") : raw.trim();
  const smtpHost = process.env.MAIL_SMTP_HOST?.trim() || (gmail ? "smtp.gmail.com" : null);
  const imapHost = process.env.MAIL_IMAP_HOST?.trim() || (gmail ? "imap.gmail.com" : null);
  if (!smtpHost || !imapHost) return null;
  return {
    user,
    pass,
    fromName: process.env.MAIL_FROM_NAME?.trim() || null,
    smtp: { host: smtpHost, port: Number(process.env.MAIL_SMTP_PORT) || 465 },
    imap: { host: imapHost, port: Number(process.env.MAIL_IMAP_PORT) || 993 },
  };
}

const loginHint = (cfg: MailboxConfig) =>
  cfg.smtp.host === "smtp.gmail.com" ? " Bei Gmail das App-Passwort verwenden, nicht das normale Passwort." : "";

/** Send through the mailbox. Klara sets the Message-ID itself, so the client's reply can be matched by it. */
export async function sendSmtp(mail: OutgoingMail, cfg: MailboxConfig, at: Date): Promise<SentMail> {
  const domain = cfg.user.split("@")[1] ?? "klara.local";
  const messageId = `klara-${uid()}@${domain}`;
  const transport = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  try {
    await transport.sendMail({
      from: cfg.fromName ? { name: cfg.fromName, address: cfg.user } : cfg.user,
      to: mail.to,
      cc: mail.cc.length ? mail.cc : undefined,
      subject: mail.subject,
      text: mail.text,
      messageId: `<${messageId}>`,
      headers: mail.metadata?.case_reference ? { "X-Klara-Reference": mail.metadata.case_reference } : undefined,
      attachments: mail.attachments.map((a) => ({ filename: a.name, content: a.content, contentType: a.contentType })),
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "EAUTH") throw new HttpError(`Das Postfach hat die Anmeldung abgelehnt.${loginHint(cfg)}`, 502);
    throw new HttpError(`Versand über ${cfg.smtp.host} fehlgeschlagen: ${err instanceof Error ? err.message : "unbekannter Fehler"}`, 502);
  } finally {
    transport.close();
  }
  return { messageId, submittedAt: at.toISOString(), delivery: "smtp" };
}

export type InboxResult = {
  /** Unread messages looked at. */
  checked: number;
  /** Replies Klara took over (matched or stored unassigned). */
  received: { case_id: string | null; kind: string; followup_case_id: string | null; duplicate: boolean }[];
};

const REFERENCE = /KL-\d{4}-\d{4}/;

// One check at a time per server instance (the case page polls every few seconds).
let running: Promise<InboxResult> | null = null;

/**
 * Read new answers from the mailbox: unread messages of the last 7 days that
 * reply to a Klara e-mail (In-Reply-To / References) or name a reference
 * KL-YYYY-NNNN in the subject. Those go through the same handler as a
 * webhook reply and are marked read; everything else stays untouched.
 */
export function checkInbox(at: Date): Promise<InboxResult> {
  if (running) return running;
  running = readInbox(at).finally(() => {
    running = null;
  });
  return running;
}

async function readInbox(at: Date): Promise<InboxResult> {
  const cfg = mailboxConfig();
  if (!cfg) throw new HttpError("Kein Postfach eingerichtet (MAIL_USER und MAIL_PASSWORD).", 503);
  const sentIds = (await store().list("email_out")).map((m) => m.message_id).filter((x): x is string => !!x);

  const client = new ImapFlow({ host: cfg.imap.host, port: cfg.imap.port, secure: true, auth: { user: cfg.user, pass: cfg.pass }, logger: false });
  try {
    await client.connect();
  } catch (err) {
    const auth = /auth|credential|login/i.test(err instanceof Error ? err.message : "");
    throw new HttpError(auth ? `Das Postfach hat die Anmeldung abgelehnt.${loginHint(cfg)}` : "Postfach nicht erreichbar. Bitte später erneut versuchen.", 502);
  }
  const received: InboxResult["received"] = [];
  let checked = 0;
  const lock = await client.getMailboxLock("INBOX");
  try {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const uids = (await client.search({ seen: false, since }, { uid: true })) || [];
    checked = uids.length;
    for (const id of uids.slice(-25)) {
      const msg = await client.fetchOne(String(id), { source: true }, { uid: true });
      if (!msg || !msg.source) continue;
      const mail = await simpleParser(msg.source);
      const subject = mail.subject ?? "";
      const refs = Array.isArray(mail.references) ? mail.references : mail.references ? [mail.references] : [];
      const thread = [mail.inReplyTo ?? "", ...refs].join(" ");
      if (!sentIds.some((s) => thread.includes(s)) && !REFERENCE.test(subject)) continue;

      const from = mail.from?.value[0];
      const text = mail.text ?? "";
      const r = await receiveReply(
        {
          From: from?.address ?? mail.from?.text ?? "",
          FromFull: { Email: from?.address ?? "", Name: from?.name ?? "" },
          Subject: subject,
          TextBody: text,
          StrippedTextReply: stripQuoted(text),
          HtmlBody: typeof mail.html === "string" ? mail.html : undefined,
          MessageID: mail.messageId,
          Date: mail.date?.toUTCString(),
          Headers: [
            ...(mail.messageId ? [{ Name: "Message-ID", Value: mail.messageId }] : []),
            ...(mail.inReplyTo ? [{ Name: "In-Reply-To", Value: mail.inReplyTo }] : []),
            ...(refs.length ? [{ Name: "References", Value: refs.join(" ") }] : []),
          ],
        },
        at,
      );
      await client.messageFlagsAdd(String(id), ["\\Seen"], { uid: true });
      received.push({ case_id: r.case?.id ?? null, kind: r.classification.kind, followup_case_id: r.followup?.id ?? null, duplicate: r.duplicate });
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return { checked, received };
}
