import { BadRequestError, handle, readJson, requireString } from "@/lib/api";
import { store } from "@/lib/db";
import { LINES, fill } from "@/lib/agent/lines";
import { addTurn, createConversation, listConversations, projectNow } from "@/lib/db/repo";
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
    const now = await projectNow(team.project_id);
    const conv = await createConversation({ team_id: teamId, user_id: team.lead_user_id, kind, language: lang }, now);
    if (kind === "call") {
      // Klara opens the call in the Polier's language; their first sentence decides the language after that.
      const lead = await store().get("app_user", team.lead_user_id);
      const say = lang ?? lead?.language ?? "de";
      const name = lead?.name.split(" ")[0] ?? "";
      const greet = (l: string) => fill((LINES[l] ?? LINES.de).callGreeting, { name }).replace(/,\s*,/, ",");
      await addTurn(
        { conversation_id: conv.id, role: "klara", text_original: greet(say), text_de: greet("de"), language: say, audio_url: null },
        now,
      );
    }
    return conv;
  });
}
