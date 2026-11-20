import { connection } from "next/server";
import { BadRequestError, handle, HttpError } from "@/lib/api";
import { voiceConfig } from "@/lib/voice/config";
import { speech } from "@/lib/voice/openai";

export const maxDuration = 30;

/**
 * Klara's voice: `GET /api/tts?text=…&lang=ru` streams MP3, so an <audio>
 * element starts playing on the first chunk (SPEC D3 latency tip). Without an
 * OpenAI key: 503, and the call screen uses the browser's voice instead.
 */
export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const url = new URL(req.url);
    const text = url.searchParams.get("text")?.trim();
    const lang = url.searchParams.get("lang")?.trim() || "de";
    if (!text) throw new BadRequestError("text fehlt");
    if (text.length > 1500) throw new BadRequestError("text ist zu lang");
    if (voiceConfig().tts !== "openai") throw new HttpError("Sprachausgabe läuft im Browser (kein OPENAI_API_KEY).", 503);
    const body = await speech(text, lang);
    return new Response(body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  });
}
