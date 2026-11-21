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

// ── Meeting recordings ───────────────────────────────────────────────────
// Meetings are multilingual: NO language is set and no German prompt is sent
// (a prompt biases the detected language). The language is detected per
// segment afterwards, in the translation step (src/lib/meetings/translate.ts).

export type MeetingSttSegment = { start: number; end: number; speaker: string | null; text: string; confidence: number | null };

/**
 * Speech to text for a meeting: speaker turns with their words, each in the
 * language spoken. gpt-4o-transcribe-diarize first; if that fails, Whisper
 * segments without speakers (with a confidence from the log probability).
 */
export async function transcribeMeeting(audio: Blob, filename: string): Promise<MeetingSttSegment[]> {
  const turns = await diarizedTranscript(audio, filename);
  if (turns.length) return turns;
  return whisperSegments(audio, filename);
}

/** Who said what, when ("A", "B" …). Language auto-detected. Empty on failure. */
async function diarizedTranscript(audio: Blob, filename: string): Promise<MeetingSttSegment[]> {
  try {
    const form = new FormData();
    form.append("file", audio, filename);
    form.append("model", "gpt-4o-transcribe-diarize");
    form.append("response_format", "diarized_json");
    form.append("chunking_strategy", "auto");
    const res = await fetch(`${BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}` },
      body: form,
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      console.warn("[meetings] diarized transcription failed:", res.status, (await res.text()).slice(0, 200));
      return [];
    }
    const json = (await res.json()) as { segments?: { start: number; end: number; speaker?: string; text?: string }[] };
    const segs = (json.segments ?? [])
      .map((x) => ({ start: x.start, end: x.end, speaker: typeof x.speaker === "string" ? x.speaker : null, text: (x.text ?? "").trim(), confidence: null }))
      .filter((x) => x.text);
    return mergeFragments(segs);
  } catch (err) {
    if (err instanceof VoiceError && err.status === 503) throw err;
    console.warn("[meetings] diarized transcription failed:", err);
    return [];
  }
}

/** Fragments of one sentence by the same speaker become one segment. */
function mergeFragments(segs: MeetingSttSegment[]): MeetingSttSegment[] {
  const out: MeetingSttSegment[] = [];
  for (const s of segs) {
    const prev = out.at(-1);
    if (prev && prev.speaker === s.speaker && !/[.!?…。]$/.test(prev.text) && s.start - prev.end < 1.2 && s.end - prev.start < 30) {
      prev.text = `${prev.text} ${s.text}`;
      prev.end = s.end;
    } else out.push({ ...s });
  }
  return out;
}

/** Whisper segments, language auto-detected, no speakers. */
async function whisperSegments(audio: Blob, filename: string): Promise<MeetingSttSegment[]> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}` },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new VoiceError(`Spracherkennung fehlgeschlagen (${res.status})`);
  const json = (await res.json()) as { segments?: { start: number; end: number; text: string; avg_logprob?: number; no_speech_prob?: number }[]; text?: string };
  const segs = (json.segments ?? [])
    .map((x) => ({
      start: x.start,
      end: x.end,
      speaker: null,
      text: x.text.trim(),
      confidence: typeof x.avg_logprob === "number" ? Math.round(Math.exp(x.avg_logprob) * (1 - (x.no_speech_prob ?? 0)) * 100) / 100 : null,
    }))
    .filter((x) => x.text);
  if (segs.length) return segs;
  return json.text?.trim() ? [{ start: 0, end: 0, speaker: null, text: json.text.trim(), confidence: null }] : [];
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
