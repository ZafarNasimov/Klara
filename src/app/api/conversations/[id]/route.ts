import { connection } from "next/server";
import { handle, jsonError } from "@/lib/api";
import { getConversation, listTurns } from "@/lib/db/repo";

export async function GET(_req: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const conversation = await getConversation(id);
  if (!conversation) return jsonError("Gespräch nicht gefunden", 404);
  return handle(async () => ({ conversation, turns: await listTurns(id) }));
}
