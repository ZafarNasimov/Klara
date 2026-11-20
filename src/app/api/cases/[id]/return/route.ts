import { handle, jsonError } from "@/lib/api";
import { returnForCompletion } from "@/lib/case-actions";

export async function POST(req: Request, ctx: RouteContext<"/api/cases/[id]/return">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { user_id?: string; note?: string } | null;
  if (!body?.user_id) return jsonError("user_id erforderlich");
  return handle(() => returnForCompletion(id, body.user_id!, body.note?.trim() || null));
}
