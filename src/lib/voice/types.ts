// Voice pipeline types shared by the API and the call screen (client-safe).
import type { TurnResponse } from "@/lib/agent/types";

export type VoiceConfig = {
  /** Speech-to-text: OpenAI, or none (typed text only). */
  stt: "openai" | "none";
  /** Klara's voice: OpenAI audio, or the browser's speechSynthesis. */
  tts: "openai" | "browser";
  /** Hands-free tuning from /admin/demo. */
  vad: VadSettings;
};

export type VadSettings = { silence_ms: number; min_speech_ms: number; positive_threshold: number };

export const DEFAULT_VAD: VadSettings = { silence_ms: 800, min_speech_ms: 400, positive_threshold: 0.5 };

export type VoiceResult = {
  transcript: { text: string; language: string };
  /** True when the segment was noise ("äh", a cough): nothing went to Klara. */
  ignored: boolean;
  turn: TurnResponse | null;
};
