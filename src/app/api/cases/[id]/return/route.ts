import { handle, readJson } from "@/lib/api";
import { returnForCompletion } from "@/lib/cases/actions";
import { projectNow, requireCase } from "@/lib/db/repo";

/** "Zurück zur Ergänzung": Klara asks the Polier in their language. */
export async function POST(req: Request, ctx: RouteContext<"/api/cases/[id]/return">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson<{ field?: string | null; note_de?: string | null; user_id?: string | null }>(req);
    const c = await requireCase(id);
    return { case: await returnForCompletion(id, body, await projectNow(c.project_id)) };
  });
}
