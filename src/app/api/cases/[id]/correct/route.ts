import { handle, readJson } from "@/lib/api";
import { reopenForCorrection } from "@/lib/cases/actions";
import { projectNow, requireCase } from "@/lib/db/repo";

/** "Per Sprache korrigieren": Klara asks the Polier in the team chat what to change. */
export async function POST(req: Request, ctx: RouteContext<"/api/cases/[id]/correct">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson<{ user_id?: string | null }>(req);
    const c = await requireCase(id);
    return await reopenForCorrection(id, body.user_id ?? null, await projectNow(c.project_id));
  });
}
