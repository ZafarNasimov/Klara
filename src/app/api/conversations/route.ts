import { BadRequestError, handle, readJson, requireString } from "@/lib/api";
import { store } from "@/lib/db";
import { createConversation, listConversations, projectNow } from "@/lib/db/repo";
import { NotFoundError } from "@/lib/db/store";
import type { ConversationKind } from "@/lib/types";

type Body = { team_id?: string; kind?: ConversationKind; language?: string | null };

/**
 * Open a conversation with Klara for a team. The team's Polier is the speaker.
 * A chat reuses the team's open chat; a call always starts fresh.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<Body>(req);
    const teamId = requireString(body.team_id, "team_id");
    const kind = body.kind ?? "chat";
    if (kind !== "chat" && kind !== "call") throw new BadRequestError("kind muss chat oder call sein");
    const team = await store().get("team", teamId);
    if (!team) throw new NotFoundError("team", teamId);
    if (!team.lead_user_id) throw new BadRequestError("Team hat keinen Polier");
    if (kind === "chat") {
      const open = (await listConversations(teamId)).find((c) => c.kind === "chat" && c.status === "open");
      if (open) return open;
    }
    const lang = body.language && body.language !== "auto" ? body.language : null;
    return createConversation({ team_id: teamId, user_id: team.lead_user_id, kind, language: lang }, await projectNow(team.project_id));
  });
}
