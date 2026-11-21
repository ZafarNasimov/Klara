// OpenAI speech endpoints over fetch (no SDK needed for two calls).
import "server-only";
import { HttpError } from "@/lib/api";
import { sttModel, ttsModel, ttsVoice } from "./config";

const BASE = "https://api.openai.com/v1";

export class VoiceError extends HttpError {
  constructor(message: string, status = 502) {
    super(message, status);
    this.name = "VoiceError";
  }
}

function key(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new VoiceError("Spracherkennung ist nicht eingerichtet (OPENAI_API_KEY fehlt).", 503);
  return k;
}

const LANGUAGE_NAMES: Record<string, string> = {
  de: "German",
  en: "English",
  ru: "Russian",
  pl: "Polish",
  tr: "Turkish",
  ro: "Romanian",
  uk: "Ukrainian",
};

/** Speech to text. `language` (ISO 639-1) is a hint; the model detects otherwise. */
export async function transcribe(audio: Blob, filename: string, language: string | null): Promise<string> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", sttModel());
  form.append("response_format", "json");
  if (language && LANGUAGE_NAMES[language]) form.append("language", language);
  form.append("prompt", "Baustelle, Bauleitung, Polier, Estrich, Trockenbau, Elektro, 2.OG, Behinderung, Mehrkosten, m².");
  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}` },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new VoiceError(`Spracherkennung fehlgeschlagen (${res.status})`);
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

/**
 * Speech to text with timestamps (meeting recordings). Whisper returns
 * segments with start times; if that fails, the plain transcript comes back
 * as one segment so nothing is lost.
 */
export async function transcribeSegments(audio: Blob, filename: string, language: string | null): Promise<{ start: number; text: string }[]> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  if (language && LANGUAGE_NAMES[language]) form.append("language", language);
  form.append("prompt", "Baubesprechung, Bauleitung, Bauherr, Architekt, Elektro, Estrich, Trockenbau, 2. OG, Mehrkosten, Anordnung, Behinderung.");
  try {
    const res = await fetch(`${BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new VoiceError(`Spracherkennung fehlgeschlagen (${res.status})`);
    const json = (await res.json()) as { segments?: { start: number; text: string }[]; text?: string };
    const segs = (json.segments ?? []).map((x) => ({ start: x.start, text: x.text.trim() })).filter((x) => x.text);
    if (segs.length) return segs;
    return json.text?.trim() ? [{ start: 0, text: json.text.trim() }] : [];
  } catch (err) {
    if (err instanceof VoiceError && err.status === 503) throw err;
    const text = await transcribe(audio, filename, language);
    return text ? [{ start: 0, text }] : [];
  }
}

/** Text to speech as a streamed MP3 body. */
export async function speech(text: string, language: string): Promise<ReadableStream<Uint8Array>> {
  const lang = LANGUAGE_NAMES[language] ?? "the language of the text";
  const res = await fetch(`${BASE}/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ttsModel(),
      voice: ttsVoice(),
      input: text,
      response_format: "mp3",
      instructions: `Speak ${lang}. Calm, friendly and clear, like a helpful colleague on a noisy construction site. Moderate pace.`,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok || !res.body) throw new VoiceError(`Sprachausgabe fehlgeschlagen (${res.status})`);
  return res.body;
}
