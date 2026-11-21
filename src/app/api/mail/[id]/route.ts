import { connection } from "next/server";
import { handle, readJson } from "@/lib/api";
import { draftView, updateDraft } from "@/lib/mail/drafts";

/** The composer's data: draft, case, attached letter version, why it cannot be sent yet. */
export async function GET(_req: Request, ctx: RouteContext<"/api/mail/[id]">) {
  await connection();
  return handle(async () => draftView((await ctx.params).id));
}

/** Save edits (to, cc, subject, body) of an unsent draft. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/mail/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    await updateDraft(id, await readJson(req));
    return draftView(id);
  });
}
