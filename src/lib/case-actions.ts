// Human-in-the-loop actions on a case (SPEC hard rules: nothing leaves without
// an explicit human release; sent versions are immutable).
import "server-only";
import { store } from "@/lib/db";
import { addEvent, getCase, listDocumentVersions, now as clockNow, updateCase } from "@/lib/db/repo";

export async function validateCase(caseId: string, userId: string) {
  const c = await getCase(caseId);
  if (!c) throw new Error("Vorgang nicht gefunden");
  if (c.status !== "bereit") throw new Error("Nur Vorgänge mit Status „Bereit“ können validiert werden.");
  const latest = (await listDocumentVersions(caseId)).at(-1);
  if (!latest) throw new Error("Noch kein Dokument erzeugt");
  const at = await clockNow(c.project_id);
  await store().update("document_version", latest.id, { validated_by: userId, validated_at: at.toISOString() });
  const updated = await updateCase(caseId, { status: "validiert" });
  const user = await store().get("app_user", userId);
  await addEvent(
    { project_id: c.project_id, case_id: caseId, kind: "case_validated", payload: { version: latest.version, by: user?.name ?? userId } },
    at,
  );
  return updated;
}

export async function returnForCompletion(caseId: string, userId: string, note: string | null) {
  const c = await getCase(caseId);
  if (!c) throw new Error("Vorgang nicht gefunden");
  if (["versendet", "beantwortet", "abgeschlossen"].includes(c.status)) {
    throw new Error("Versendete Vorgänge können nicht zurückgegeben werden.");
  }
  const at = await clockNow(c.project_id);
  const updated = await updateCase(caseId, { status: "unvollstaendig" });
  const user = await store().get("app_user", userId);
  await addEvent(
    {
      project_id: c.project_id,
      case_id: caseId,
      kind: "returned_for_completion",
      payload: { by: user?.name ?? userId, note, missing: c.missing_fields },
    },
    at,
  );
  return updated;
}
