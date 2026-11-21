// E-mail drafts for a case's letter (SPEC §8 /admin/mail/[draftId], §12):
// one unsent draft per case, editable; "Senden" only for a validated case
// with the validated version attached. Sending makes that version immutable.
import "server-only";
import { BadRequestError } from "@/lib/api";
import { store } from "@/lib/db";
import { addEvent, addEvidence, getProjectContext, listDocumentVersions, requireCase, toCaseViews, uid, updateCase } from "@/lib/db/repo";
import { NotFoundError } from "@/lib/db/store";
import { requireDocType } from "@/lib/doctypes";
import { hasTemplate } from "@/lib/documents/build";
import { renderDocx } from "@/lib/documents/docx";
import { renderPdf } from "@/lib/documents/pdf";
import { channelCheck } from "@/lib/rules";
import type { DocBody } from "@/lib/documents/types";
import type { AppUser, Case, DocumentVersion, EmailOut, MailDraftView } from "@/lib/types";
import { validateCase, validationBlocker } from "@/lib/cases/actions";
import type { ProjectContext } from "@/lib/db/repo";
import { emailsOf, mailRecipients, mailSubject, suggestBody } from "./compose";
import { fieldBlocker, type Addressee } from "./fields";
import { deliver, mailDelivery, mailFrom } from "./postmark";

const SENT_STATUSES = new Set(["versendet", "beantwortet", "abgeschlossen"]);

export async function requireDraft(id: string): Promise<EmailOut> {
  const d = await store().get("email_out", id);
  if (!d) throw new NotFoundError("email_out", id);
  return d;
}

const attachmentName = (c: Case, v: DocumentVersion, ext: "pdf" | "docx") => `${c.reference}_v${v.version}.${ext}`;

/**
 * Why the case or letter does not allow sending (status, version, addressee check); null when it does.
 * `assumeValidated`: the check that applies once the Bauleiter validates in the same step.
 */
export function stateBlocker(
  c: Case,
  latest: DocumentVersion | null,
  draft: EmailOut,
  recipientRed: string | null,
  opts: { assumeValidated?: boolean } = {},
): string | null {
  if (draft.status !== "entwurf") return "Diese E-Mail ist bereits versendet.";
  if (SENT_STATUSES.has(c.status)) return "Das Schreiben ist bereits versendet.";
  if (!opts.assumeValidated && c.status !== "validiert") return "Senden ist erst möglich, wenn die Bauleitung das Schreiben validiert hat.";
  if (!latest || latest.id !== draft.document_version_id) return "Das Schreiben hat sich seit dem Entwurf geändert. Bitte die E-Mail neu vorbereiten.";
  if (!opts.assumeValidated && !latest.validated_at) return "Diese Version des Schreibens ist noch nicht validiert.";
  return recipientRed;
}

/** The contact the letter version is addressed to, with an e-mail address. */
function addresseeOf(v: DocumentVersion | null, ctx: ProjectContext): Addressee | null {
  const k = v?.addressee_contact_id ? ctx.contacts.find((x) => x.id === v.addressee_contact_id) : null;
  return k?.email ? { email: k.email, name: k.name, organisation: k.organisation } : null;
}

const redOf = (c: Case, ctx: ProjectContext) => {
  const rec = mailRecipients(c, ctx);
  return { rec, red: rec.check.light === "red" ? `${rec.check.label_de}: ${rec.check.reason_de}` : null };
};

/** Why the draft cannot be sent (null when it can). */
export function sendBlocker(c: Case, latest: DocumentVersion | null, draft: EmailOut, recipientRed: string | null, addressee: Addressee | null): string | null {
  return stateBlocker(c, latest, draft, recipientRed) ?? fieldBlocker(draft, addressee);
}

/** Everything the composer shows for one draft. */
export async function draftView(id: string): Promise<MailDraftView> {
  const draft = await requireDraft(id);
  const c = await requireCase(draft.case_id);
  const [versions, ctx] = await Promise.all([listDocumentVersions(c.id), getProjectContext(c.project_id)]);
  const version = versions.find((v) => v.id === draft.document_version_id) ?? null;
  const latest = versions[0] ?? null;
  const { rec, red } = redOf(c, ctx);
  const addressee = addresseeOf(version, ctx);
  const [view] = await toCaseViews([c], ctx);
  const signer = ctx.users.find((u) => u.role === "bauleiter");
  const needsValidation = draft.status === "entwurf" && !SENT_STATUSES.has(c.status) && c.status !== "validiert";
  return {
    draft,
    case: view,
    version,
    addressee,
    sender: { name: signer?.name ?? "Bauleitung", role: "Bauleitung", company: ctx.company.name },
    contacts: ctx.contacts
      .filter((x) => x.email)
      .map((x) => ({ email: x.email!, name: x.name, organisation: x.organisation, role: x.role, has_authority: x.has_authority })),
    recipient_check: rec.check,
    attachments: version
      ? [
          { name: attachmentName(c, version, "pdf"), url: `/api/documents/${version.id}/pdf?variant=letter`, kind: "pdf" as const },
          { name: attachmentName(c, version, "docx"), url: `/api/documents/${version.id}/docx`, kind: "docx" as const },
        ]
      : [],
    validated_by_name: ctx.users.find((u) => u.id === version?.validated_by)?.name ?? null,
    send_blocker: sendBlocker(c, latest, draft, red, addressee),
    state_blocker: stateBlocker(c, latest, draft, red),
    needs_validation: needsValidation,
    validation_blocker: needsValidation ? (validationBlocker(c) ?? stateBlocker(c, latest, draft, red, { assumeValidated: true })) : null,
    delivery: mailDelivery(),
    from: mailFrom(),
  };
}

// Opening the composer twice at once (React dev mode runs effects twice) must not make two drafts.
const creating = new Map<string, Promise<EmailOut>>();

/**
 * The draft for a case: the unsent one (moved to the latest letter version),
 * the sent one, or a new one with subject, recipients and a suggested body.
 */
export function createDraft(caseId: string, at: Date): Promise<EmailOut> {
  const running = creating.get(caseId);
  if (running) return running;
  const p = makeDraft(caseId, at).finally(() => creating.delete(caseId));
  creating.set(caseId, p);
  return p;
}

async function makeDraft(caseId: string, at: Date): Promise<EmailOut> {
  const c = await requireCase(caseId);
  if (!hasTemplate(c.doc_type)) throw new BadRequestError("Für diesen Dokumenttyp gibt es kein Schreiben.");
  if (requireDocType(c.doc_type).recipient === "internal") throw new BadRequestError("Interner Bericht, kein Versand nach außen.");
  const [versions, mails] = await Promise.all([listDocumentVersions(c.id), store().list("email_out", { where: { case_id: c.id } })]);
  const latest = versions[0];
  if (!latest) throw new BadRequestError("Es gibt noch kein Schreiben zu diesem Vorgang.");

  const sent = mails.find((m) => m.status !== "entwurf");
  const open = mails.find((m) => m.status === "entwurf");
  if (open) return open.document_version_id === latest.id || sent ? open : store().update("email_out", open.id, { document_version_id: latest.id });
  if (sent) return sent;

  const ctx = await getProjectContext(c.project_id);
  const rec = mailRecipients(c, ctx);
  const suggestion = await suggestBody(c, latest.body as DocBody, ctx);
  const draft = await store().insert("email_out", {
    id: uid(),
    case_id: c.id,
    document_version_id: latest.id,
    to: emailsOf([rec.to]),
    cc: emailsOf(rec.cc),
    subject: mailSubject(c, ctx.project.name),
    body: suggestion.body,
    message_id: null,
    sent_at: null,
    status: "entwurf",
  });
  await addEvent(
    { project_id: c.project_id, case_id: c.id, kind: "email_drafted", payload: { reference: c.reference, summary_de: `An ${draft.to.join(", ") || "–"}` } },
    at,
  );
  return draft;
}

const cleanList = (v: unknown, field: string): string[] => {
  if (!Array.isArray(v)) throw new BadRequestError(`${field} muss eine Liste sein`);
  return [...new Set(v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean))];
};

/** Save the office's edits to an unsent draft. */
export async function updateDraft(id: string, patch: { to?: unknown; cc?: unknown; subject?: unknown; body?: unknown }): Promise<EmailOut> {
  const draft = await requireDraft(id);
  if (draft.status !== "entwurf") throw new BadRequestError("Diese E-Mail ist bereits versendet und kann nicht mehr geändert werden.");
  const out: Partial<EmailOut> = {};
  if (patch.to !== undefined) out.to = cleanList(patch.to, "An");
  if (patch.cc !== undefined) out.cc = cleanList(patch.cc, "CC");
  if (patch.subject !== undefined) out.subject = typeof patch.subject === "string" ? patch.subject.replace(/\s+/g, " ").trim() : "";
  if (patch.body !== undefined) out.body = typeof patch.body === "string" ? patch.body.replace(/\r\n/g, "\n") : "";
  return Object.keys(out).length ? store().update("email_out", id, out) : draft;
}

async function requireSender(id: string | null | undefined): Promise<AppUser> {
  if (!id) throw new BadRequestError("Benutzer fehlt");
  const u = await store().get("app_user", id);
  if (!u) throw new NotFoundError("app_user", id);
  if (u.role !== "bauleiter" && u.role !== "buero") throw new BadRequestError("Senden kann nur das Büro oder die Bauleitung.");
  return u;
}

/**
 * Send the draft with page 1 of the validated letter as PDF (DOCX optional).
 * Afterwards the version is immutable and the case is "versendet" (SPEC §4, §12).
 */
export async function sendDraft(
  id: string,
  opts: { userId?: string | null; attachDocx?: boolean; validate?: boolean },
  at: Date,
): Promise<EmailOut> {
  const user = await requireSender(opts.userId);
  const draft = await requireDraft(id);
  let c = await requireCase(draft.case_id);

  // "Validieren und senden": the Bauleiter approves the version on screen and sends it in one step.
  if (opts.validate && c.status !== "validiert" && !SENT_STATUSES.has(c.status) && draft.status === "entwurf") {
    const { case: validated, version } = await validateCase(c.id, user.id, at);
    if (version.id !== draft.document_version_id) {
      // The letter was rebuilt while validating (e.g. a new date): show it before anything goes out.
      await store().update("email_out", draft.id, { document_version_id: version.id });
      throw new BadRequestError("Beim Validieren ist eine neue Version des Schreibens entstanden. Bitte prüfen und dann senden.");
    }
    c = validated;
  }

  const [versions, ctx] = await Promise.all([listDocumentVersions(c.id), getProjectContext(c.project_id)]);
  const latest = versions[0] ?? null;
  const { red } = redOf(c, ctx);
  const blocker = sendBlocker(c, latest, draft, red, addresseeOf(latest, ctx));
  if (blocker || !latest) throw new BadRequestError(blocker ?? "Es gibt noch kein Schreiben zu diesem Vorgang.");

  const letter = latest.body as DocBody;
  const [pdf, docx] = await Promise.all([renderPdf(letter, null), opts.attachDocx ? renderDocx(letter) : Promise.resolve(null)]);
  const sent = await deliver(
    {
      to: draft.to,
      cc: draft.cc,
      subject: draft.subject,
      text: draft.body,
      attachments: [
        { name: attachmentName(c, latest, "pdf"), content: pdf, contentType: "application/pdf" },
        ...(docx
          ? [{ name: attachmentName(c, latest, "docx"), content: docx, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }]
          : []),
      ],
      metadata: { case_reference: c.reference, case_id: c.id },
    },
    at,
  );

  const simulated = sent.delivery === "simulated";
  const sentAt = at.toISOString();
  const recipients = draft.to.join(", ");
  const summary = `An ${recipients}${draft.cc.length ? `, CC ${draft.cc.join(", ")}` : ""}${simulated ? " (Testversand, nicht zugestellt)" : ""}`;
  // "Übermittlung": sent, delivery not confirmed yet (a Postmark delivery webhook would turn it green).
  const channel = simulated
    ? { ...channelCheck({ sentAt, delivered: false }), reason_de: "Testversand ohne E-Mail-Server, nicht zugestellt" }
    : channelCheck({ sentAt, delivered: false });
  const checks = c.checks.map((x) => (x.id === "channel" ? channel : x));
  const [saved] = await Promise.all([
    store().update("email_out", draft.id, { status: "versendet", message_id: sent.messageId, sent_at: sentAt }),
    store().update("document_version", latest.id, { immutable: true, sent_at: sentAt, delivery_status: simulated ? "simuliert" : "versendet" }),
    updateCase(c.id, { status: "versendet", checks }, at),
    addEvidence(
      {
        case_id: c.id,
        kind: "email",
        ref: sent.messageId,
        data: { direction: "out", to: draft.to, cc: draft.cc, subject: draft.subject, simulated, by: user.name, summary_de: `E-Mail versendet. ${summary}` },
      },
      at,
    ),
  ]);
  // Last: the event makes open screens refetch the stored state.
  await addEvent(
    { project_id: c.project_id, case_id: c.id, kind: "email_sent", payload: { reference: c.reference, subject: draft.subject, by: user.name, simulated, summary_de: summary } },
    at,
  );
  return saved;
}
