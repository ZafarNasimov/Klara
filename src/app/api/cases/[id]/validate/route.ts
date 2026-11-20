import { handle, jsonError } from "@/lib/api";
import { validateCase } from "@/lib/case-actions";

export async function POST(req: Request, ctx: RouteContext<"/api/cases/[id]/validate">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { user_id?: string } | null;
  if (!body?.user_id) return jsonError("user_id erforderlich");
  return handle(() => validateCase(id, body.user_id!));
}
