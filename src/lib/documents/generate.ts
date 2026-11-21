// Document versions (SPEC §4, §6.2 step 6): build the letter, hash page 1,
// store a new version. Sent versions are immutable; a change after sending is
// a new linked case, never a new version of the sent one.
import "server-only";
import { createHash } from "node:crypto";
import { BadRequestError } from "@/lib/api";
import { store } from "@/lib/db";
import { addEvent, getCase, getProjectContext, listDocumentVersions, listEvidence, requireCase, uid, type ProjectContext } from "@/lib/db/repo";
import { NotFoundError } from "@/lib/db/store";
import { readFile } from "@/lib/files";
import { berlinDay } from "@/lib/deadlines";
import { requireDocType } from "@/lib/doctypes";
import { resolveRecipient } from "@/lib/rules";
import type { Case, DocumentVersion } from "@/lib/types";
import { buildBody, hasTemplate, toMarkdown } from "./build";
import type { AuditInfo } from "./pdf";
import type { DocBody } from "./types";

export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

async function related(c: Case): Promise<{ parent: Case | null; mehrkosten: Case | null }> {
  const parent = c.parent_case_id ? await getCase(c.parent_case_id) : null;
  let mehrkosten: Case | null = null;
  // Drafted from the client's e-mail together with its Mehrkostenanzeige (SPEC §6.4).
  if (c.doc_type === "anordnung_bestaetigung" && typeof c.facts._mehrkosten_case_id === "string") {
    mehrkosten = await getCase(c.facts._mehrkosten_case_id);
  } else if (c.doc_type === "anordnung_bestaetigung" && c.conversation_id) {
    const siblings = await store().list("case", { where: { conversation_id: c.conversation_id, doc_type: "mehrkostenanzeige" } });
    mehrkosten = siblings.find((s) => s.status !== "entwurf" || c.status === "entwurf") ?? null;
  }
  return { parent, mehrkosten };
}

type NewEvent = Parameters<typeof addEvent>[0];

/**
 * Build and store the next version of a case's letter. Returns null for types without a template.
 * `opts.ctx`: the project context the caller already loaded (saves the round trips).
 * `opts.queueEvent`: the caller writes the "document_generated" event itself (an agent turn writes all its events last).
 */
export async function generateDocument(
  caseId: string,
  at: Date,
  opts: { ctx?: ProjectContext; queueEvent?: (e: NewEvent) => void } = {},
): Promise<DocumentVersion | null> {
  const [c, versions] = await Promise.all([requireCase(caseId), listDocumentVersions(caseId)]);
  if (!hasTemplate(c.doc_type)) return null;
  if (versions.some((v) => v.immutable)) throw new BadRequestError("Das Schreiben ist versendet und kann nicht mehr geändert werden");

  const [ctx, rel] = await Promise.all([opts.ctx ?? getProjectContext(c.project_id), related(c)]);
  const body = buildBody({ c, letterDate: berlinDay(at), related: rel }, ctx);
  const md = toMarkdown(body);
  const hash = sha256(md);
  const latest = versions[0];
  if (latest && latest.sha256 === hash) return latest;

  const recipient = resolveRecipient(requireDocType(c.doc_type).recipient, ctx, {
    instructedBy: typeof c.facts.instructed_by === "string" ? c.facts.instructed_by : null,
    subcontractorContactId: typeof c.facts._contact_id === "string" ? c.facts._contact_id : null,
  });
  const id = uid();
  const version = (latest?.version ?? 0) + 1;
  const v = await store().insert("document_version", {
    id,
    case_id: c.id,
    version,
    body,
    body_md: md,
    pdf_url: `/api/documents/${id}/pdf`,
    docx_url: `/api/documents/${id}/docx`,
    sha256: hash,
    addressee_contact_id: recipient.to?.id ?? null,
    tone: null,
    created_at: at.toISOString(),
    validated_by: null,
    validated_at: null,
    sent_at: null,
    delivery_status: null,
    immutable: false,
  });
  // After the row: the event triggers the office screen's refetch.
  const event: NewEvent = { project_id: c.project_id, case_id: c.id, kind: "document_generated", payload: { reference: c.reference, version, sha256: hash } };
  if (opts.queueEvent) opts.queueEvent(event);
  else await addEvent(event, at);
  return v;
}

export async function requireVersion(id: string): Promise<DocumentVersion> {
  const v = await store().get("document_version", id);
  if (!v) throw new NotFoundError("document_version", id);
  return v;
}

/** Data for the internal audit page (PDF page 2). */
export async function auditInfo(v: DocumentVersion): Promise<{ body: DocBody; audit: AuditInfo; c: Case }> {
  const c = await requireCase(v.case_id);
  const [ctx, evidence] = await Promise.all([getProjectContext(c.project_id), listEvidence(c.id)]);
  const name = (id: string | null) => ctx.users.find((u) => u.id === id)?.name ?? id;
  const transcript = evidence.find((e) => e.kind === "transcript")?.data.turns;
  const weather = evidence.find((e) => e.kind === "weather")?.data.summary_de;
  // react-pdf embeds JPEG and PNG only.
  const shots = evidence.filter((e) => e.kind === "photo" && e.ref && /^image\/(jpeg|png)$/.test(String(e.data.content_type))).slice(0, 6);
  const photos = (
    await Promise.all(
      shots.map(async (e) => {
        const data = await readFile(e.ref!);
        return data
          ? { data, format: (e.data.content_type === "image/png" ? "png" : "jpg") as "jpg" | "png", at: e.created_at, by: typeof e.data.by === "string" ? e.data.by : "Polier" }
          : null;
      }),
    )
  ).filter((x) => !!x);
  return {
    c,
    body: v.body as DocBody,
    audit: {
      version: v.version,
      sha256: v.sha256 ?? "",
      created_at: v.created_at,
      author: name(c.created_by),
      validated_by: name(v.validated_by),
      validated_at: v.validated_at,
      sent_at: v.sent_at,
      delivery_status: v.delivery_status,
      checks: c.checks,
      transcript: Array.isArray(transcript) ? (transcript as AuditInfo["transcript"]) : [],
      weather: typeof weather === "string" ? weather : null,
      photos,
    },
  };
}
