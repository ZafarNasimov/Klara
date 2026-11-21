import { handle, readJson, requireString } from "@/lib/api";
import { projectNow, requireCase } from "@/lib/db/repo";
import { createDraft, draftView } from "@/lib/mail/drafts";

// The body suggestion is one short model call (falls back to a fixed text after 8 s).
export const maxDuration = 30;

/** "E-Mail vorbereiten": the case's draft (new, or the existing unsent / sent one). */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ case_id?: string }>(req);
    const c = await requireCase(requireString(body.case_id, "case_id"));
    const draft = await createDraft(c.id, await projectNow(c.project_id));
    return draftView(draft.id);
  });
}
