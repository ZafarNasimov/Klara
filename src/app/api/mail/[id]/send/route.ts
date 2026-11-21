import { handle, readJson } from "@/lib/api";
import { projectNow, requireCase } from "@/lib/db/repo";
import { draftView, requireDraft, sendDraft } from "@/lib/mail/drafts";

export const maxDuration = 60;

/** "Senden" (SPEC §8, §12): only for a validated case; the sent version becomes immutable. `validate: true` = "Validieren und senden" (Bauleiter). */
export async function POST(req: Request, ctx: RouteContext<"/api/mail/[id]/send">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson<{ user_id?: string; attach_docx?: boolean; validate?: boolean }>(req);
    const c = await requireCase((await requireDraft(id)).case_id);
    await sendDraft(id, { userId: body.user_id, attachDocx: body.attach_docx === true, validate: body.validate === true }, await projectNow(c.project_id));
    return draftView(id);
  });
}
