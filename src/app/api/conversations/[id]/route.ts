import { connection } from "next/server";
import { handle } from "@/lib/api";
import { store } from "@/lib/db";
import { getConversation, listTurns, toCaseViews } from "@/lib/db/repo";
import { NotFoundError } from "@/lib/db/store";
import type { ConversationDetail } from "@/lib/types";

/** A conversation with its team, turns (oldest first) and the cases it produced. */
export async function GET(_req: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  await connection();
  return handle(async (): Promise<ConversationDetail> => {
    const { id } = await ctx.params;
    const conversation = await getConversation(id);
    if (!conversation) throw new NotFoundError("conversation", id);
    const team = await store().get("team", conversation.team_id);
    if (!team) throw new NotFoundError("team", conversation.team_id);
    const [turns, cases] = await Promise.all([listTurns(id), store().list("case", { where: { conversation_id: id } })]);
    const lead = team.lead_user_id ? await store().get("app_user", team.lead_user_id) : null;
    return {
      conversation,
      team,
      lead_name: lead?.name ?? null,
      turns,
      cases: await toCaseViews(cases.filter((c) => c.status !== "entwurf").sort((a, b) => a.created_at.localeCompare(b.created_at))),
    };
  });
}
