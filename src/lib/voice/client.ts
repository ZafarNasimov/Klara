"use client";
// Browser side of the voice pipeline (SPEC §11 M3): microphone with echo
// cancellation, one recorder per spoken segment, Klara's voice through a
// single unlocked <audio> element (streamed MP3 from /api/tts) or the
// browser's speechSynthesis when no OpenAI key is set.

/** Mic constraints from the spec: the site is loud, Klara must not hear herself. */
export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
};

const BCP47: Record<string, string> = { de: "de-DE", en: "en-GB", ru: "ru-RU", pl: "pl-PL", tr: "tr-TR", ro: "ro-RO", uk: "uk-UA" };

/** A recorder format the browser supports, with the file extension STT expects. */
export function recorderFormat(): { mimeType: string | undefined; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mimeType: undefined, ext: "webm" };
  for (const [mimeType, ext] of [
    ["audio/webm;codecs=opus", "webm"],
    ["audio/webm", "webm"],
    ["audio/mp4", "mp4"],
    ["audio/ogg;codecs=opus", "ogg"],
  ] as const) {
    if (MediaRecorder.isTypeSupported(mimeType)) return { mimeType, ext };
  }
  return { mimeType: undefined, ext: "webm" };
}

/** Records one segment from an open mic stream. */
export function startRecording(stream: MediaStream): { stop: () => Promise<{ blob: Blob; ext: string; ms: number }> } {
  const { mimeType, ext } = recorderFormat();
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  const started = performance.now();
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.start();
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => resolve({ blob: new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" }), ext, ms: performance.now() - started });
        if (rec.state !== "inactive") rec.stop();
        else rec.onstop?.(new Event("stop"));
      }),
  };
}

/** 0.1 s of silence as a WAV data URI: played inside the tap so iOS lets the element play later. */
function silentWav(): string {
  const rate = 8000;
  const samples = rate / 10;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples * 2, true);
  let bin = "";
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export type Speaker = {
  /** Call from the tap that starts the call (iOS needs a gesture for audio). */
  unlock: () => void;
  speak: (text: string, lang: string) => Promise<void>;
  stop: () => void;
  readonly mode: "openai" | "browser";
};

export function createSpeaker(mode: "openai" | "browser"): Speaker {
  const audio = typeof Audio !== "undefined" ? new Audio() : null;
  let cancel: (() => void) | null = null;
  let current: "openai" | "browser" = mode;

  const browserSpeak = (text: string, lang: string) =>
    new Promise<void>((resolve) => {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!synth) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = BCP47[lang] ?? lang;
      const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
      if (voice) u.voice = voice;
      u.rate = 1;
      // Some browsers never fire `end`; never let the call hang on it.
      const guard = window.setTimeout(done, 2500 + text.length * 90);
      function done() {
        window.clearTimeout(guard);
        cancel = null;
        resolve();
      }
      u.onend = done;
      u.onerror = done;
      cancel = () => {
        synth.cancel();
        done();
      };
      synth.cancel();
      synth.speak(u);
    });

  const openaiSpeak = (text: string, lang: string) =>
    new Promise<void>((resolve, reject) => {
      if (!audio) return resolve();
      const done = () => {
        audio.onended = null;
        audio.onerror = null;
        cancel = null;
        resolve();
      };
      audio.onended = done;
      audio.onerror = () => {
        audio.onended = null;
        audio.onerror = null;
        cancel = null;
        reject(new Error("tts"));
      };
      cancel = () => {
        audio.pause();
        done();
      };
      audio.src = `/api/tts?${new URLSearchParams({ text, lang })}`;
      audio.play().catch(() => audio.onerror?.(new Event("error")));
    });

  return {
    get mode() {
      return current;
    },
    unlock() {
      if (audio) {
        audio.src = silentWav();
        audio.play().catch(() => {});
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        // Wake the voice list and the speech engine inside the gesture.
        window.speechSynthesis.getVoices();
        const u = new SpeechSynthesisUtterance("");
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    },
    async speak(text, lang) {
      if (current === "openai") {
        try {
          return await openaiSpeak(text, lang);
        } catch {
          current = "browser"; // OpenAI voice failed once: stay on the browser voice for this call.
        }
      }
      return browserSpeak(text, lang);
    },
    stop() {
      cancel?.();
    },
  };
}

/** One AudioContext per call, created inside the start tap (iOS needs the gesture). */
export function createAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  void ctx.resume().catch(() => {});
  return ctx;
}

/** Live input level 0…1 for the waveform, read from an AnalyserNode on the call's AudioContext. */
export function createLevelMeter(stream: MediaStream, ctx: AudioContext): { read: (bins: Float32Array) => void; close: () => void } {
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.6;
  src.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  return {
    read(bins) {
      analyser.getByteFrequencyData(data);
      const per = Math.floor(data.length / 2 / bins.length) || 1; // speech sits in the lower half
      for (let i = 0; i < bins.length; i++) {
        let sum = 0;
        for (let j = 0; j < per; j++) sum += data[i * per + j] ?? 0;
        bins[i] = Math.min(1, sum / per / 180);
      }
    },
    close() {
      src.disconnect();
    },
  };
}
