import { handle, readJson } from "@/lib/api";
import { validateCase } from "@/lib/cases/actions";
import { projectNow, requireCase } from "@/lib/db/repo";

/** "Validieren": the Bauleiter approves the current letter version. */
export async function POST(req: Request, ctx: RouteContext<"/api/cases/[id]/validate">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson<{ user_id?: string }>(req);
    const c = await requireCase(id);
    return validateCase(id, body.user_id, await projectNow(c.project_id));
  });
}
