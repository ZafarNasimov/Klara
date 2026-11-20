import { handle, jsonError } from "@/lib/api";
import { createConversation } from "@/lib/db/repo";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { team_id?: string; user_id?: string; kind?: "call" | "chat"; language?: string }
    | null;
  if (!body?.team_id || !body.user_id) return jsonError("team_id und user_id erforderlich");
  return handle(() =>
    createConversation({
      team_id: body.team_id!,
      user_id: body.user_id!,
      kind: body.kind ?? "chat",
      language: body.language ?? null,
    }),
  );
}
