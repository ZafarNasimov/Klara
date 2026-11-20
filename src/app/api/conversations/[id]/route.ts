import { connection } from "next/server";
import { handle } from "@/lib/api";
import { getConversation, listTurns } from "@/lib/db/repo";
import { NotFoundError } from "@/lib/db/store";

/** A conversation with its turns, oldest first. */
export async function GET(_req: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  await connection();
  return handle(async () => {
    const { id } = await ctx.params;
    const conversation = await getConversation(id);
    if (!conversation) throw new NotFoundError("conversation", id);
    return { conversation, turns: await listTurns(id) };
  });
}
