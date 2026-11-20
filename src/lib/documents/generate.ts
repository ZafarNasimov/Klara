// Document builder: case → fixed German template → document_version
// (body + Markdown + sha256). PDF/DOCX are rendered from the stored body.
import "server-only";
import { createHash } from "node:crypto";
import { getDocType } from "@/lib/doctypes";
import { store } from "@/lib/db";
import { addEvent, addEvidence, getCase, getProjectContext, listDocumentVersions, listEvidence, now as clockNow, uid } from "@/lib/db/repo";
import { fmtDateTime } from "@/lib/labels";
import { evaluateCase } from "@/lib/rules";
import type { Case, DocumentVersion } from "@/lib/types";
import type { AuditData, DocBody } from "./model";
import { renderMarkdown } from "./render-md";
import { TEMPLATES } from "./templates";
import { fetchWeather, weatherText } from "./weather";

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export async function buildBody(c: Case, at: Date): Promise<{ body: DocBody; addresseeId: string | null }> {
  const def = getDocType(c.doc_type);
  const tpl = TEMPLATES[c.doc_type];
  if (!def || !tpl) throw new Error(`Keine Vorlage für ${c.doc_type}`);
  const ctx = await getProjectContext(c.project_id);
  const ev = evaluateCase(
    { def, facts: c.facts, sphere: c.sphere, now: at, subcontractorContactId: (c.facts.subcontractor_contact_id as string) ?? null },
    ctx,
  );
  const parent = c.parent_case_id ? await getCase(c.parent_case_id) : null;
  let linkedMehrkosten: Case | null = null;
  if (c.doc_type === "anordnung_bestaetigung" && c.conversation_id) {
    linkedMehrkosten =
      (await store().list("case", { where: { conversation_id: c.conversation_id, doc_type: "mehrkostenanzeige" } }))[0] ?? null;
  }
  const signatory = ctx.users.find((u) => u.role === "bauleiter") ?? null;
  const body = tpl({
    project: ctx.project,
    company: ctx.company,
    c,
    facts: c.facts,
    addressee: ev.recipient.to,
    cc: ev.recipient.cc,
    signatory,
    now: at,
    parent,
    linkedMehrkosten,
  });
  return { body, addresseeId: ev.recipient.to?.id ?? null };
}

/** Create the next version of a case's document. Sent versions are immutable. */
export async function generateVersion(caseId: string): Promise<DocumentVersion> {
  const c = await getCase(caseId);
  if (!c) throw new Error("Vorgang nicht gefunden");
  if (c.status === "versendet" || c.status === "beantwortet" || c.status === "abgeschlossen") {
    throw new Error("Versendete Schreiben sind unveränderlich. Änderungen nur als neuer, verknüpfter Vorgang.");
  }
  const at = await clockNow(c.project_id);
  const { body, addresseeId } = await buildBody(c, at);
  const md = renderMarkdown(body);
  const versions = await listDocumentVersions(caseId);
  const id = uid();
  const v: DocumentVersion = {
    id,
    case_id: caseId,
    version: (versions.at(-1)?.version ?? 0) + 1,
    body,
    body_md: md,
    pdf_url: `/api/documents/${id}/pdf`,
    docx_url: `/api/documents/${id}/docx`,
    sha256: sha256(md),
    addressee_contact_id: addresseeId,
    tone: "sachlich",
    created_at: at.toISOString(),
    validated_by: null,
    validated_at: null,
    sent_at: null,
    delivery_status: null,
    immutable: false,
  };
  await store().insert("document_version", v);
  await addEvent(
    { project_id: c.project_id, case_id: caseId, kind: "document_generated", payload: { version: v.version, sha256: v.sha256 } },
    at,
  );
  return v;
}

/** Attach weather of the event day as evidence (once per case). */
export async function ensureWeatherEvidence(c: Case): Promise<void> {
  const existing = (await listEvidence(c.id)).find((e) => e.kind === "weather");
  if (existing) return;
  const ctx = await getProjectContext(c.project_id);
  const at = typeof c.facts.start_at === "string" ? new Date(c.facts.start_at) : new Date(c.created_at);
  const w = await fetchWeather(ctx.project.lat, ctx.project.lng, Number.isNaN(at.getTime()) ? new Date() : at);
  if (!w) return;
  await addEvidence({ case_id: c.id, kind: "weather", ref: "open-meteo", data: { ...w, text: weatherText(w) } }, await clockNow(c.project_id));
}

export async function auditData(v: DocumentVersion): Promise<AuditData> {
  const c = await getCase(v.case_id);
  const evidence = await listEvidence(v.case_id);
  const transcript = evidence.find((e) => e.kind === "transcript");
  const weather = evidence.find((e) => e.kind === "weather");
  const validator = v.validated_by ? await store().get("app_user", v.validated_by) : null;
  const turns = (transcript?.data.turns as { role: string; at: string; text: string; text_de: string | null }[] | undefined) ?? [];
  return {
    sha256: v.sha256 ?? "",
    version: v.version,
    created_at: v.created_at,
    validated_by: validator?.name ?? null,
    validated_at: v.validated_at ? fmtDateTime(v.validated_at) : null,
    marker: "KI-unterstützt erstellt, vom Bauleiter geprüft.",
    timestamps: [
      ["Vorgang angelegt", c ? fmtDateTime(c.created_at) : ""],
      ["Dokument erzeugt", fmtDateTime(v.created_at)],
      ...(v.sent_at ? ([["Versendet", fmtDateTime(v.sent_at)]] as [string, string][]) : []),
    ],
    transcript: turns.map((t) => ({ ...t, at: fmtDateTime(t.at) })),
    weather: (weather?.data.text as string) ?? null,
    photos: evidence.filter((e) => e.kind === "photo").map((e) => e.ref ?? ""),
  };
}

export async function getVersion(id: string) {
  return store().get("document_version", id);
}
