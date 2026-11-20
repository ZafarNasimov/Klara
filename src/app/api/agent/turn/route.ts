import { handle, jsonError } from "@/lib/api";
import { runTurn } from "@/lib/agent/turn";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { conversation_id?: string; text_original?: string; language?: string | null }
    | null;
  if (!body?.conversation_id || !body.text_original?.trim()) {
    return jsonError("conversation_id und text_original erforderlich");
  }
  return handle(() =>
    runTurn({ conversation_id: body.conversation_id!, text_original: body.text_original!.trim(), language: body.language ?? null }),
  );
}
