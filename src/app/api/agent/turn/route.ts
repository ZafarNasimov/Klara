import { handle, readJson, requireString } from "@/lib/api";
import { runTurn } from "@/lib/agent/turn";

// Extraction + phrasing can take a few seconds with the live model.
export const maxDuration = 60;

type Body = { conversation_id?: string; text_original?: string; language?: string | null };

/** One turn with Klara (SPEC §6.2): `{ conversation_id, text_original, language }`. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<Body>(req);
    return runTurn({
      conversationId: requireString(body.conversation_id, "conversation_id"),
      text: requireString(body.text_original, "text_original"),
      language: body.language ?? null,
    });
  });
}
