"use client";
// Hands-free turn-taking (SPEC §11 M3 step 2): Silero VAD in the browser via
// @ricky0123/vad-web, on the call's open mic and AudioContext. Each detected
// utterance becomes a 16 kHz WAV segment for the same /api/voice pipeline as
// push-to-talk. The library loads on demand; its model, worklet and ONNX
// runtime are served from /vad/ (copied there by `npm install`).
import type { VadSettings } from "./types";

export type HandsFree = {
  /** Listen for speech (no-op while already listening). */
  start: () => Promise<void>;
  /** Stop listening; a half-heard utterance is dropped, the mic stays open. */
  pause: () => Promise<void>;
  destroy: () => Promise<void>;
};

export async function loadHandsFree(opts: {
  stream: MediaStream;
  ctx: AudioContext;
  settings: VadSettings;
  onSpeechStart: () => void;
  onSpeechEnd: (wav: Blob) => void;
  onMisfire: () => void;
}): Promise<HandsFree> {
  const { MicVAD, utils } = await import("@ricky0123/vad-web");
  const { settings } = opts;
  const vad = await MicVAD.new({
    model: "v5",
    baseAssetPath: "/vad/",
    onnxWASMBasePath: "/vad/",
    ortConfig: (ort) => {
      ort.env.logLevel = "error";
      ort.env.wasm.numThreads = 1; // no cross-origin isolation, so no wasm threads
    },
    audioContext: opts.ctx,
    // The call owns the mic: the VAD reads the same stream and never stops it.
    getStream: async () => opts.stream,
    pauseStream: async () => {},
    resumeStream: async () => opts.stream,
    startOnLoad: false,
    positiveSpeechThreshold: settings.positive_threshold,
    negativeSpeechThreshold: Math.max(0.05, settings.positive_threshold - 0.15),
    redemptionMs: settings.silence_ms,
    minSpeechMs: settings.min_speech_ms,
    preSpeechPadMs: 300,
    submitUserSpeechOnPause: false,
    onSpeechStart: opts.onSpeechStart,
    onVADMisfire: opts.onMisfire,
    onSpeechEnd: (audio) => opts.onSpeechEnd(new Blob([utils.encodeWAV(audio, 1, 16000, 1, 16)], { type: "audio/wav" })),
  });
  return { start: () => vad.start(), pause: () => vad.pause(), destroy: () => vad.destroy() };
}
