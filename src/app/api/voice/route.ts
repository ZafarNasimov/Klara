import { connection } from "next/server";
import { BadRequestError, handle } from "@/lib/api";
import { guessLanguage } from "@/lib/agent/mock";
import { runTurn } from "@/lib/agent/turn";
import { DEFAULT_PROJECT_ID, getProject } from "@/lib/db/repo";
import { voiceConfig } from "@/lib/voice/config";
import { transcribe } from "@/lib/voice/openai";
import { isNoise } from "@/lib/voice/segment";
import type { VoiceResult } from "@/lib/voice/types";

// Speech-to-text plus the agent turn in one round trip.
export const maxDuration = 60;

/** Which voice services are live (the call screen picks its mode from this). */
export async function GET() {
  await connection();
  return handle(async () => voiceConfig((await getProject(DEFAULT_PROJECT_ID)).settings.vad));
}

const field = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/**
 * SPEC §6.1: multipart `audio` (+ `conversation_id`, optional `language` hint)
 * → STT → noise filter → the agent turn. Noise ("äh", a cough) comes back as
 * `ignored` and never reaches Klara.
 */
export async function POST(req: Request) {
  return handle(async (): Promise<VoiceResult> => {
    const form = await req.formData().catch(() => {
      throw new BadRequestError("Erwartet multipart/form-data mit audio");
    });
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) throw new BadRequestError("audio fehlt");
    const conversationId = field(form, "conversation_id");
    const hint = field(form, "language");
    const name = audio instanceof File && audio.name ? audio.name : "segment.webm";

    const text = await transcribe(audio, name, hint);
    const language = hint ?? guessLanguage(text);
    const ignored = isNoise(text);
    if (ignored || !conversationId) return { transcript: { text, language }, ignored, turn: null };
    const turn = await runTurn({ conversationId, text, language: hint });
    return { transcript: { text, language: turn.language }, ignored: false, turn };
  });
}
