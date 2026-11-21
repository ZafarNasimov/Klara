// The office case page's data (GET /api/cases/[id]). Server only.
import "server-only";
import { store } from "@/lib/db";
import { caseChain, getCase, listDocumentVersions, listEvents, listEvidence, requireCase, toCaseViews } from "@/lib/db/repo";
import type { CaseDetail } from "@/lib/types";
import { askableFields, validationBlocker } from "./actions";

/** One case with versions, evidence, its history, linked cases and mail. */
export async function caseDetail(id: string): Promise<CaseDetail> {
  const c = await requireCase(id);
  const [versions, evidence, events, children, parent, emails, replies, chain] = await Promise.all([
    listDocumentVersions(id),
    listEvidence(id),
    listEvents({ caseId: id }),
    store().list("case", { where: { parent_case_id: id }, order: { column: "created_at" } }),
    c.parent_case_id ? getCase(c.parent_case_id) : Promise.resolve(null),
    store().list("email_out", { where: { case_id: id } }),
    store().list("email_in", { where: { case_id: id }, order: { column: "received_at", ascending: false } }),
    caseChain(c),
  ]);
  // "Verlauf" shows the whole chain (SPEC §1): this case's events are loaded, the linked letters' follow.
  const [linkedEvents, [view, ...linked]] = await Promise.all([
    Promise.all(chain.filter((x) => x.id !== c.id).map((x) => listEvents({ caseId: x.id }))).then((x) => x.flat()),
    toCaseViews([c, ...(parent ? [parent] : []), ...children]),
  ]);
  return {
    case: view,
    parent: parent ? linked[0] : null,
    children: parent ? linked.slice(1) : linked,
    versions,
    evidence,
    events,
    validation_blocker: c.status === "validiert" ? null : validationBlocker(c),
    askable_fields: askableFields(c),
    chain: chain.map((x) => ({ id: x.id, reference: x.reference, doc_type: x.doc_type })),
    chain_events: [...events, ...linkedEvents].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    emails,
    // The raw webhook payload can carry attachments; the screen needs none of it.
    replies: replies.map((r) => ({ ...r, raw: null })),
  };
}
