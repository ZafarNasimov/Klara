import { handle } from "@/lib/api";
import { projectNow, requireCase } from "@/lib/db/repo";
import { generateDocument } from "@/lib/documents/generate";

/** Build the next letter version from the case's current facts (no-op when nothing changed). */
export async function POST(_req: Request, ctx: RouteContext<"/api/cases/[id]/document">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const c = await requireCase(id);
    return { version: await generateDocument(id, await projectNow(c.project_id)) };
  });
}
