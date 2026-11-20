import { handle } from "@/lib/api";
import { hangUp } from "@/lib/agent/turn";

/** "Auflegen": close the call; unconfirmed drafts stay for the office. */
export async function POST(_req: Request, ctx: RouteContext<"/api/conversations/[id]/end">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return hangUp(id);
  });
}
