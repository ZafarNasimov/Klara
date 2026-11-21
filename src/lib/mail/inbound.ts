// Replies from the client (SPEC §6.4): store, match to the case, classify,
// and propose the follow-up. The Postmark inbound webhook and the demo button
// "Antwort simulieren" (SPEC D5) both go through `receiveReply`.
import "server-only";
import { BadRequestError } from "@/lib/api";
import { store } from "@/lib/db";
import {
  addEvent,
  addEvidence,
  createCase,
  DEFAULT_PROJECT_ID,
  getProjectContext,
  listDocumentVersions,
  listEvidence,
  requireCase,
  uid,
  updateCase,
  type ProjectContext,
} from "@/lib/db/repo";
import { berlinDay } from "@/lib/deadlines";
import { docTitle, requireDocType } from "@/lib/doctypes";
import { generateDocument } from "@/lib/documents/generate";
import { dateDe, dateTimeDe } from "@/lib/documents/templates/kit";
import type { DocBody } from "@/lib/documents/types";
import { fmtNumber, REPLY_KIND_DE, ROLE_GENITIVE_DE } from "@/lib/labels";
import { canonicalTradeName, evaluateCase } from "@/lib/rules";
import type { Case, EmailIn, Evidence, ReplyClassification } from "@/lib/types";
import { classifyReply, replySentences } from "./classify";

/** The parts of Postmark's inbound JSON Klara uses. */
export type InboundPayload = {
  From?: string;
  FromName?: string;
  FromFull?: { Email?: string; Name?: string };
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  MessageID?: string;
  Date?: string;
  Headers?: { Name?: string; Value?: string }[];
};

export type InboundResult = {
  email: EmailIn;
  case: Case | null;
  classification: ReplyClassification;
  /** The follow-up letter Klara drafted (rejection of a Behinderungsanzeige). */
  followup: Case | null;
  /** Postmark delivered the same message again; nothing new was stored. */
  duplicate: boolean;
};

export const REJECTION_HINT_DE = "Eine Zurückweisung macht die Behinderungsanzeige nicht unwirksam. Vorschlag: Stellungnahme mit Nachweisen.";

const REFERENCE = /KL-\d{4}-\d{4}/;

function header(p: InboundPayload, name: string): string | null {
  const h = p.Headers?.find((x) => x.Name?.toLowerCase() === name.toLowerCase());
  return h?.Value?.trim() || null;
}

const addressOf = (v: string) => (v.match(/<([^>]+)>/)?.[1] ?? v).trim().toLowerCase();

const htmlToText = (html: string) =>
  html
    .replace(/<(br|\/p|\/div)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

/** The quoted core of the reply: one sentence, whitespace normalized, at most 240 characters. */
const oneSentence = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 240);

/**
 * Which case the reply belongs to (SPEC §6.4 step 2): our message id in
 * In-Reply-To/References, else a KL reference in subject or text. The
 * message id check is a substring test, so `<id@mtasv.net>` and `<id>` both match.
 */
async function matchCase(p: InboundPayload, subject: string, text: string): Promise<Case | null> {
  const thread = [header(p, "In-Reply-To"), header(p, "References")].filter(Boolean).join(" ");
  if (thread) {
    const sent = (await store().list("email_out")).filter((m) => m.message_id && thread.includes(m.message_id));
    if (sent[0]) return requireCase(sent[0].case_id);
  }
  const ref = `${subject}\n${text}\n${p.TextBody ?? ""}`.match(REFERENCE)?.[0];
  if (ref) return (await store().list("case", { where: { reference: ref } }))[0] ?? null;
  return null;
}

export async function receiveReply(p: InboundPayload, at: Date): Promise<InboundResult> {
  const from = addressOf(p.FromFull?.Email || p.From || "");
  const subject = (p.Subject ?? "").replace(/\s+/g, " ").trim();
  const text = (p.StrippedTextReply?.trim() || p.TextBody?.trim() || htmlToText(p.HtmlBody ?? "")).trim();
  const messageId = header(p, "Message-ID") ?? p.MessageID ?? null;
  const thread = [header(p, "In-Reply-To"), header(p, "References")].filter(Boolean).join(" ") || null;

  // Postmark retries until it gets a 200: the same message must not make a second follow-up.
  if (messageId) {
    const seen = (await store().list("email_in", { where: { message_id: messageId } }))[0];
    if (seen) {
      const c = seen.case_id ? await store().get("case", seen.case_id) : null;
      const cls = (seen.classification ?? { kind: "other", summary_de: "", key_points: [], requested_items: [], source: "mock" }) as ReplyClassification;
      return { email: seen, case: c, classification: cls, followup: null, duplicate: true };
    }
  }

  const c = await matchCase(p, subject, text);
  const contacts = await store().list("contact", c ? { where: { project_id: c.project_id } } : {});
  const sender = contacts.find((x) => x.email?.toLowerCase() === from) ?? null;
  const projectId = c?.project_id ?? sender?.project_id ?? DEFAULT_PROJECT_ID;

  const classification = await classifyReply({ subject, text, letterTitle: c ? docTitle(c.doc_type) : null, reference: c?.reference ?? null });
  const email = await store().insert("email_in", {
    id: uid(),
    project_id: projectId,
    case_id: c?.id ?? null,
    from_addr: from,
    subject,
    body_text: text,
    in_reply_to: thread,
    message_id: messageId,
    received_at: at.toISOString(),
    classification: classification as unknown as Record<string, unknown>,
    raw: p as unknown as Record<string, unknown>,
  });

  const kindDe = REPLY_KIND_DE[classification.kind];
  const who = sender ? ROLE_GENITIVE_DE[sender.role] : "des Absenders";
  // In quotation marks only the client's own words; otherwise Klara's summary, without quotation marks.
  const verbatim = classification.quote ? oneSentence(classification.quote) : null;
  const quote = verbatim ?? oneSentence(classification.key_points[0] ?? replySentences(text)[0] ?? classification.summary_de);

  if (!c) {
    // SPEC §6.4 (c): no case found; the office assigns it.
    await addEvent(
      { project_id: projectId, case_id: null, kind: "reply_received", payload: { from, subject, kind: classification.kind, summary_de: `Antwort ohne Zuordnung von ${from}: ${kindDe}` } },
      at,
    );
    return { email, case: null, classification, followup: null, duplicate: false };
  }

  const ctx = await getProjectContext(c.project_id);
  const followup = classification.kind === "rejection" && c.doc_type === "behinderungsanzeige" ? await draftRebuttal(c, email, quote, ctx, at) : null;

  // An answer to the letter proves it arrived ("Übermittlung" turns green).
  const checks = c.checks.map((x) =>
    x.id === "channel" ? { ...x, light: "green" as const, reason_de: `Zugang belegt: Antwort ${who} vom ${dateDe(berlinDay(at))}` } : x,
  );
  await Promise.all([
    updateCase(c.id, { status: classification.kind === "acceptance" ? "abgeschlossen" : "beantwortet", checks }, at),
    addEvidence(
      {
        case_id: c.id,
        kind: "email",
        ref: email.id,
        data: { direction: "in", from, subject, kind: classification.kind, quote, summary_de: `Antwort ${who}: ${kindDe}. ${classification.summary_de}` },
      },
      at,
    ),
  ]);
  // Events last (each one makes the office screen refetch), +1 ms each to keep their order.
  const events: Parameters<typeof addEvent>[0][] = [
    {
      project_id: c.project_id,
      case_id: c.id,
      kind: "reply_received",
      payload: {
        reference: c.reference,
        from,
        subject,
        kind: classification.kind,
        email_in_id: email.id,
        summary_de: `Antwort ${who}: ${kindDe} – ${verbatim ? `„${verbatim}“` : classification.summary_de}`,
      },
    },
    ...(followup
      ? [
          {
            project_id: c.project_id,
            case_id: c.id,
            kind: "followup_proposed",
            payload: {
              reference: followup.reference,
              doc_type: followup.doc_type,
              case_id: followup.id,
              hint_de: REJECTION_HINT_DE,
              summary_de: `${docTitle(followup.doc_type)} ${followup.reference} mit Nachweisen vorbereitet`,
            },
          },
        ]
      : []),
    ...(classification.kind === "acceptance"
      ? [{ project_id: c.project_id, case_id: c.id, kind: "case_closed", payload: { reference: c.reference, summary_de: `${kindDe}: ${classification.summary_de}` } }]
      : []),
  ];
  for (const [i, e] of events.entries()) await addEvent(e, new Date(at.getTime() + i));
  return { email, case: await requireCase(c.id), classification, followup, duplicate: false };
}

/**
 * SPEC §5.2 `stellungnahme_zurueckweisung`: reference to our notice, the core
 * of the rejection, and the evidence list; letter v1 is generated right away.
 */
async function draftRebuttal(orig: Case, email: EmailIn, quote: string, ctx: ProjectContext, at: Date): Promise<Case> {
  const [versions, evidence] = await Promise.all([listDocumentVersions(orig.id), listEvidence(orig.id)]);
  const sent = versions.find((v) => v.sent_at) ?? versions[0] ?? null;
  const origDate = (sent?.body as DocBody | undefined)?.date ?? berlinDay(new Date(orig.created_at));
  const author = ctx.users.find((u) => u.id === orig.created_by)?.name ?? null;
  const facts: Record<string, unknown> = {
    reply_date: berlinDay(at),
    reply_quote: quote,
    orig_reference: orig.reference,
    orig_date: origDate,
    evidence_bullets: rebuttalEvidence(orig, evidence, ctx, author),
    _hint_de: REJECTION_HINT_DE,
    _reply_email_id: email.id,
    ...(typeof orig.facts._trade === "string" ? { _trade: orig.facts._trade } : {}),
  };
  const def = requireDocType("stellungnahme_zurueckweisung");
  const ev = evaluateCase({ def, facts, sphere: orig.sphere, confidence: null, now: at }, ctx);
  const created = await createCase(
    {
      project_id: orig.project_id,
      // Office correspondence: not shown in the Polier's channel.
      team_id: null,
      conversation_id: null,
      doc_type: def.id,
      status: ev.missing_fields.length ? "unvollstaendig" : "bereit",
      sphere: orig.sphere,
      facts,
      missing_fields: ev.missing_fields,
      checks: ev.checks,
      deadline_at: ev.deadline.due_at,
      deadline_rule: ev.deadline_rule,
      parent_case_id: orig.id,
      created_by: null,
      asked_fields: [],
      declined_fields: [],
      flags: [],
      created_at: at.toISOString(),
    },
    at,
  );
  await generateDocument(created.id, at, { ctx });
  await addEvent(
    { project_id: created.project_id, case_id: created.id, kind: "case_created", payload: { reference: created.reference, doc_type: created.doc_type } },
    new Date(at.getTime() + 1),
  );
  return created;
}

/** SPEC §5.2: timestamps, photos, weather, schedule vs actual, as plain German lines for the letter. */
export function rebuttalEvidence(orig: Case, evidence: Evidence[], ctx: ProjectContext, author: string | null): string[] {
  const f = orig.facts;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().replace(/[.\s]+$/, "") : null);
  const out: string[] = [];

  const start = str(f.start_at);
  const area = str(f.area);
  if (start) out.push(`Beginn der Behinderung: ${dateTimeDe(start)}${area ? `, Bereich ${area}` : ""}`);
  const cause = str(f.cause);
  if (cause) out.push(`Ursache laut Meldung von der Baustelle: ${cause}`);
  const works = str(f.affected_works);
  const idle = typeof f.idle_staff === "number" ? f.idle_staff : null;
  if (works || idle) out.push([works ? `Betroffen: ${works}` : null, idle ? `${fmtNumber(idle)} Arbeitskräfte ohne Einsatz` : null].filter(Boolean).join("; "));

  const transcript = evidence.find((e) => e.kind === "transcript");
  const turns = Array.isArray(transcript?.data.turns) ? (transcript.data.turns as { role: string; at: string }[]) : [];
  const first = turns.find((t) => t.role === "user");
  if (first) out.push(`Meldung durch ${author ?? "den Polier"} am ${dateTimeDe(first.at)}; Gesprächsprotokoll mit Zeitstempeln liegt vor`);

  // Schedule vs actual: the causing trade's work in that area was due before the hindrance began.
  const tradeName = canonicalTradeName(str(f._trade));
  const trade = tradeName ? ctx.trades.find((t) => t.name.toLowerCase() === tradeName.toLowerCase()) : null;
  const eventDay = start ? berlinDay(new Date(start)) : berlinDay(new Date(orig.created_at));
  if (trade) {
    const item = (ctx.schedule ?? []).find(
      (s) => s.trade_id === trade.id && (!area || s.area.toLowerCase().includes(area.toLowerCase()) || area.toLowerCase().includes(s.area.toLowerCase())),
    );
    if (item && item.end_date < eventDay) out.push(`Laut Bauzeitenplan war „${item.activity}“ im ${item.area} bis ${dateDe(item.end_date)} abzuschließen`);
  }

  const photos = evidence.filter((e) => e.kind === "photo").length;
  if (photos) out.push(`${photos} ${photos === 1 ? "Foto" : "Fotos"} von der Baustelle`);
  // Weather only where it is the cause: next to a trade's hindrance it would invite "it was the weather".
  const weather = f._weather && typeof f._weather === "object" ? str((f._weather as { summary_de?: unknown }).summary_de) : null;
  if (weather && orig.sphere === "weather") out.push(`Wetter am Ort zur Ereigniszeit: ${weather}`);
  return out;
}

/**
 * "Antwort simulieren" (SPEC D5, §1 1:40): the client's scripted rejection of
 * the latest sent Behinderungsanzeige, through the same inbound path.
 */
export async function simulateReply(caseId: string | null, at: Date): Promise<InboundResult> {
  const sentMails = (await store().list("email_out")).filter((m) => m.status === "versendet" && m.message_id);
  let mail = caseId ? sentMails.find((m) => m.case_id === caseId) : null;
  if (!mail && !caseId) {
    const candidates = await Promise.all(sentMails.map(async (m) => ({ m, c: await store().get("case", m.case_id) })));
    const open = candidates
      .filter((x) => x.c && x.c.status === "versendet")
      .sort((a, b) => (b.m.sent_at ?? "").localeCompare(a.m.sent_at ?? ""));
    mail = (open.find((x) => x.c!.doc_type === "behinderungsanzeige") ?? open[0])?.m ?? null;
  }
  if (!mail) throw new BadRequestError(caseId ? "Zu diesem Vorgang wurde noch keine E-Mail versendet." : "Es gibt noch kein versendetes Schreiben ohne Antwort.");

  const c = await requireCase(mail.case_id);
  const ctx = await getProjectContext(c.project_id);
  const to = mail.to[0]?.toLowerCase() ?? "";
  const contact = ctx.contacts.find((x) => x.email?.toLowerCase() === to) ?? ctx.contacts.find((x) => x.role === "bauherr") ?? null;
  const trade = canonicalTradeName(typeof c.facts._trade === "string" ? c.facts._trade : null);
  const title = docTitle(c.doc_type);
  const sent = (await listDocumentVersions(c.id)).find((v) => v.sent_at);
  const letterDate = (sent?.body as DocBody | undefined)?.date;
  const reason = c.doc_type === "behinderungsanzeige" ? (trade ? ` Die ${trade}arbeiten liegen im Zeitplan.` : " Die Vorleistungen liegen im Zeitplan.") : "";
  const id = uid();
  return receiveReply(
    {
      From: contact?.email ? `${contact.name} <${contact.email}>` : to,
      FromFull: { Email: contact?.email ?? to, Name: contact?.name ?? "" },
      Subject: `AW: ${mail.subject}`,
      TextBody: [
        "Sehr geehrte Damen und Herren,",
        `wir weisen Ihre ${title}${letterDate ? ` vom ${dateDe(letterDate)}` : ""} zurück.${reason}`,
        `Mit freundlichen Grüßen\n${contact?.name ?? ""}\n${contact?.organisation ?? ""}`.trim(),
      ].join("\n\n"),
      MessageID: id,
      Date: at.toUTCString(),
      Headers: [
        { Name: "Message-ID", Value: `<sim-reply-${id}@klara.local>` },
        { Name: "In-Reply-To", Value: `<${mail.message_id}>` },
      ],
    },
    at,
  );
}
