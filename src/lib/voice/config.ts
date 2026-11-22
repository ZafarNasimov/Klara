// Which voice services are live (SPEC §2): OpenAI for speech-to-text and
// text-to-speech when OPENAI_API_KEY is set. Without it the call screen
// takes typed text and Klara speaks with the browser's built-in voice.
import "server-only";
import { DEFAULT_VAD, type VadSettings, type VoiceConfig } from "./types";

export { DEFAULT_VAD };

export function voiceConfig(vad?: VadSettings | null): VoiceConfig {
  const key = !!process.env.OPENAI_API_KEY;
  const provider = process.env.TTS_PROVIDER || "openai";
  return {
    stt: key ? "openai" : "none",
    tts: key && provider === "openai" ? "openai" : "browser",
    vad: vad ?? DEFAULT_VAD,
  };
}

export const sttModel = () => process.env.STT_MODEL || "gpt-4o-transcribe";
export const ttsModel = () => process.env.TTS_MODEL || "gpt-4o-mini-tts";
/** Klara's voice: "coral", a warm female voice. */
export const ttsVoice = () => process.env.TTS_VOICE || "coral";
