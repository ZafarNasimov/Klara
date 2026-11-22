"use client";
// Call screen (SPEC §8 /app/call/[callId], §11 M3): an in-app call with Klara.
// Hands-free (default): the browser's voice detector hears where an utterance
// starts and ends and sends it; it is paused while Klara thinks and speaks.
// Push-to-talk (toggle, and the fallback when the detector can't load): hold
// the big button, speak, let go (or tap to start and tap to send). Both send
// the audio to /api/voice (speech-to-text + the agent turn in one round trip);
// Klara's reply plays through /api/tts or the browser's voice. Typing works at
// any time and is the only input when speech-to-text is not set up.
// Turn states: listening → recording → processing → speaking → listening.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Camera, Keyboard, Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { KlaraAvatar, type KlaraMood } from "@/components/klara/klara-avatar";
import { BTN_OUTLINE, BTN_PRIMARY } from "@/components/mobile/buttons";
import { CaseCard } from "@/components/mobile/case-card";
import { MobileHeader } from "@/components/mobile/mobile-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cardLines } from "@/lib/agent/lines";
import type { TurnResponse } from "@/lib/agent/types";
import type { CaseView, Conversation, ConversationDetail, Turn } from "@/lib/types";
import { uploadPhoto } from "@/lib/photo-client";
import { ApiError, postJson } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { createAudioContext, createLevelMeter, createSpeaker, MIC_CONSTRAINTS, startRecording, type Speaker } from "@/lib/voice/client";
import { DEFAULT_VAD, type VoiceConfig, type VoiceResult } from "@/lib/voice/types";
import { loadHandsFree, type HandsFree } from "@/lib/voice/vad";
import { $t, $tx } from "@/lib/i18n";

type Phase = "ready" | "ringing" | "connecting" | "listening" | "recording" | "processing" | "speaking" | "ended";
type Mode = "handsfree" | "ptt";

const BARS = 21;
/** Shorter presses are a tap: recording keeps running until the next tap. */
const TAP_MS = 350;
/** Segments shorter than this are a slip of the thumb, not speech. */
const MIN_SEGMENT_MS = 450;

export function CallView({ callId, teamId, teamName, incoming }: { callId: string; teamId: string | null; teamName: string | null; incoming: boolean }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [cfg, setCfg] = useState<VoiceConfig | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(incoming ? "ringing" : "ready");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [cases, setCases] = useState<CaseView[]>([]);
  const [lang, setLang] = useState("de");
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [toggleRec, setToggleRec] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [micReady, setMicReady] = useState(false);
  const [mode, setMode] = useState<Mode>("handsfree");
  const [vadState, setVadState] = useState<"off" | "loading" | "ready" | "failed">("off");
  const [muted, setMuted] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const convRef = useRef<Conversation | null>(null);
  /** The language of Klara's greeting (the Polier's registered one): picks the speech-to-text vocabulary hint before the first sentence. */
  const greetLangRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const recRef = useRef<ReturnType<typeof startRecording> | null>(null);
  const pressRef = useRef(0);
  const meterRef = useRef<ReturnType<typeof createLevelMeter> | null>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const vadRef = useRef<HandsFree | null>(null);
  const liveRef = useRef<{ phase: Phase; mode: Mode }>({ phase, mode });
  const vadHandlers = useRef<{ start: () => void; end: (wav: Blob) => void; misfire: () => void }>({ start() {}, end() {}, misfire() {} });

  const isNew = callId === "new";
  const team = detail?.team ?? null;

  /** "Foto" during the call: goes to the case being talked about; Klara's confirmation shows in the transcript (not spoken). */
  const sendPhoto = async (file: File) => {
    const conv = convRef.current;
    const teamOfCall = detail?.team?.id ?? teamId;
    if (!conv || !teamOfCall) return;
    setPhotoBusy(true);
    try {
      const r = await uploadPhoto({ file, teamId: teamOfCall, conversationId: conv.id });
      const klara = r.klara_turn;
      if (klara) setTurns((prev) => [...prev, klara]);
      setNotice(null);
    } catch (e) {
      setNotice(e instanceof ApiError && e.status < 500 ? $tx(e.message) : $t("Das Foto wurde nicht gesendet. Bitte erneut versuchen."));
    } finally {
      setPhotoBusy(false);
    }
  };
  const channelHref = team ? `/app/channel/${team.id}` : teamId ? `/app/channel/${teamId}` : "/app";
  const voice = cfg?.stt === "openai" && micReady;
  const handsFree = voice && mode === "handsfree";

  // ── Load: voice config, and the conversation when it already exists ──
  useEffect(() => {
    let off = false;
    fetch("/api/voice", { cache: "no-store" })
      .then((r) => r.json() as Promise<VoiceConfig>)
      .then((c) => !off && setCfg(c))
      .catch(() => !off && setCfg({ stt: "none", tts: "browser", vad: DEFAULT_VAD }));
    if (!isNew) {
      fetch(`/api/conversations/${callId}`, { cache: "no-store" })
        .then(async (r) => {
          const body = await r.json().catch(() => null);
          if (!r.ok) throw new Error(body?.error ?? `Fehler ${r.status}`);
          return body as ConversationDetail;
        })
        .then((d) => {
          if (off) return;
          setDetail(d);
          convRef.current = d.conversation;
          greetLangRef.current = [...d.turns].reverse().find((t) => t.role === "klara")?.language ?? null;
          setTurns(d.turns);
          setCases(d.cases);
          setLang(d.conversation.language ?? "de");
          if (d.conversation.status === "closed") setPhase("ended");
        })
        .catch((e: unknown) => !off && setLoadError(e instanceof Error ? $tx(e.message) : $t("Laden fehlgeschlagen")));
    }
    return () => {
      off = true;
    };
  }, [callId, isNew]);

  // Release the microphone and stop Klara when the screen goes away.
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      void vadRef.current?.destroy();
      meterRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void ctxRef.current?.close().catch(() => {});
      speakerRef.current?.stop();
    },
    [],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [turns.length, phase, reduce]);

  // ── Waveform: the mic level drives the bars directly, no re-render per frame ──
  const startMeter = useCallback(() => {
    const bars = barsRef.current?.children;
    const meter = meterRef.current;
    if (!bars || !meter) return;
    const levels = new Float32Array(BARS);
    const tick = () => {
      meter.read(levels);
      for (let i = 0; i < bars.length; i++) {
        // Mirror around the centre bar so the shape reads as a voice, not an equaliser.
        const d = Math.abs(i - (BARS - 1) / 2);
        const v = levels[Math.min(BARS - 1, Math.round(d))];
        (bars[i] as HTMLElement).style.transform = `scaleY(${Math.max(0.08, v).toFixed(3)})`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);
  const stopMeter = useCallback(() => cancelAnimationFrame(rafRef.current), []);

  // ── Klara speaks, then listens again ──
  const say = useCallback(async (text: string, language: string) => {
    setPhase("speaking");
    await speakerRef.current?.speak(text, language);
  }, []);

  const finish = useCallback(() => {
    stopMeter();
    void vadRef.current?.destroy();
    vadRef.current = null;
    meterRef.current?.close();
    meterRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setMicReady(false);
    setVadState("off");
    setPhase("ended");
  }, [stopMeter]);

  const handleTurn = useCallback(
    async (t: TurnResponse) => {
      setTurns((prev) => [...prev, t.user_turn, t.klara_turn]);
      setCases((prev) => {
        const map = new Map(prev.map((c) => [c.id, c]));
        for (const c of t.cases) if (c.status !== "entwurf") map.set(c.id, c);
        return [...map.values()];
      });
      setLang(t.language);
      // From now on speech-to-text gets the speaker's language as a firm hint.
      if (convRef.current && t.language) convRef.current = { ...convRef.current, language: t.language };
      setAwaitingConfirm(t.awaiting_confirm);
      await say(t.reply, t.language);
      if (t.ended) finish();
      else setPhase("listening");
    },
    [say, finish],
  );

  const failed = useCallback((e: unknown) => {
    setNotice(
      e instanceof ApiError && e.status === 503
        ? $t("{msg} Schreiben Sie Ihre Antwort.", { msg: $tx(e.message) })
        : e instanceof ApiError && e.status < 500
          ? $tx(e.message)
          : $t("Klara ist gerade nicht erreichbar. Bitte noch einmal versuchen."),
    );
    if (e instanceof ApiError && e.status === 503) setTyping(true);
    setPhase("listening");
  }, []);

  // ── Hands-free: the detector loads while Klara greets ──
  const prepareHandsFree = (stream: MediaStream, ctx: AudioContext) => {
    setVadState("loading");
    loadHandsFree({
      stream,
      ctx,
      settings: cfg?.vad ?? DEFAULT_VAD,
      onSpeechStart: () => vadHandlers.current.start(),
      onSpeechEnd: (wav) => vadHandlers.current.end(wav),
      onMisfire: () => vadHandlers.current.misfire(),
    })
      .then((vad) => {
        if (streamRef.current !== stream) return void vad.destroy(); // the call ended meanwhile
        vadRef.current = vad;
        setVadState("ready");
      })
      .catch(() => {
        if (streamRef.current !== stream) return;
        setVadState("failed");
        setMode("ptt");
        setNotice($t("Freihändig startet auf diesem Gerät nicht. Halten Sie die Taste, solange Sie sprechen."));
      });
  };

  // ── Start (the tap unlocks audio and the mic, SPEC M3 iOS note) ──
  const start = async () => {
    const speaker = createSpeaker(cfg?.tts ?? "browser");
    speaker.unlock();
    speakerRef.current = speaker;
    setPhase("connecting");
    setNotice(null);
    if (cfg?.stt === "openai") {
      // Created inside the tap: iOS only lets a gesture start audio input.
      const ctx = createAudioContext();
      ctxRef.current = ctx;
      try {
        const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
        streamRef.current = stream;
        if (ctx) meterRef.current = createLevelMeter(stream, ctx);
        setMicReady(true);
        if (ctx) prepareHandsFree(stream, ctx);
        else setMode("ptt");
      } catch {
        setNotice($t("Das Mikrofon ist nicht freigegeben. Sie können Ihre Antwort schreiben."));
        setTyping(true);
      }
    } else {
      setTyping(true);
    }
    try {
      let d = detail;
      if (isNew) {
        if (!teamId) throw new ApiError($t("Kein Team gewählt."), 400);
        const conv = await postJson<Conversation>("/api/conversations", { team_id: teamId, kind: "call" });
        window.history.replaceState(null, "", `/app/call/${conv.id}`);
        const r = await fetch(`/api/conversations/${conv.id}`, { cache: "no-store" });
        d = (await r.json()) as ConversationDetail;
        setDetail(d);
        setTurns(d.turns);
      }
      if (!d) throw new ApiError($t("Das Gespräch konnte nicht geladen werden."), 500);
      convRef.current = d.conversation;
      greetLangRef.current = [...d.turns].reverse().find((t) => t.role === "klara")?.language ?? null;
      setStartedAt(Date.now());
      const greeting = isNew ? [...d.turns].reverse().find((t) => t.role === "klara") : null;
      if (greeting) await say(greeting.text_original, greeting.language ?? "de");
      setPhase("listening");
    } catch (e) {
      failed(e);
      if (!convRef.current) setPhase(incoming ? "ringing" : "ready");
    }
  };

  // ── Push-to-talk ──
  const beginRecording = () => {
    if (!streamRef.current || phase !== "listening" || mode !== "ptt") return;
    setNotice(null);
    speakerRef.current?.stop();
    recRef.current = startRecording(streamRef.current);
    pressRef.current = performance.now();
    setPhase("recording");
    requestAnimationFrame(startMeter);
  };

  const endRecording = async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    setToggleRec(false);
    stopMeter();
    const { blob, ext, ms } = await rec.stop();
    if (ms < MIN_SEGMENT_MS || blob.size < 1200) {
      setNotice($t("Zu kurz. Halten Sie die Taste, solange Sie sprechen."));
      setPhase("listening");
      return;
    }
    await sendSegment(blob, `segment.${ext}`, false);
  };

  /** One spoken segment, from either mode: speech-to-text and Klara's turn in one request. */
  const sendSegment = async (blob: Blob, filename: string, quietOnNoise: boolean) => {
    if (!convRef.current) return;
    setPhase("processing");
    try {
      const form = new FormData();
      form.append("audio", blob, filename);
      form.append("conversation_id", convRef.current.id);
      // The speaker's language once known; before the first sentence, Klara's greeting language picks the vocabulary hint only.
      if (convRef.current.language) form.append("language", convRef.current.language);
      else if (greetLangRef.current) form.append("prompt_language", greetLangRef.current);
      const r = await fetch("/api/voice", { method: "POST", body: form });
      const out = await r.json().catch(() => null);
      if (!r.ok) throw new ApiError(out?.error ?? `Fehler ${r.status}`, r.status);
      const res = out as VoiceResult;
      if (res.ignored || !res.turn) {
        // Hands-free hears coughs and machines too: drop those without a word.
        if (!quietOnNoise) setNotice($t("Das habe ich nicht verstanden. Bitte noch einmal sprechen."));
        setPhase("listening");
        return;
      }
      await handleTurn(res.turn);
    } catch (e) {
      failed(e);
    }
  };

  // The detector's callbacks are created once; they read the current turn state here.
  useEffect(() => {
    liveRef.current = { phase, mode };
    vadHandlers.current = {
      start() {
        if (liveRef.current.mode !== "handsfree" || liveRef.current.phase !== "listening") return;
        setNotice(null);
        setPhase("recording");
        requestAnimationFrame(startMeter);
      },
      end(wav) {
        if (liveRef.current.mode !== "handsfree" || liveRef.current.phase !== "recording" || recRef.current) return;
        stopMeter();
        void sendSegment(wav, "segment.wav", true);
      },
      misfire() {
        if (liveRef.current.phase !== "recording" || recRef.current) return;
        stopMeter();
        setPhase("listening");
      },
    };
  });

  // Listen only while it is the user's turn; resume ~300 ms after Klara stops talking (SPEC M3).
  useEffect(() => {
    const vad = vadRef.current;
    if (!vad || vadState !== "ready") return;
    const listen = mode === "handsfree" && !muted && (phase === "listening" || phase === "recording");
    if (!listen) {
      void vad.pause();
      return;
    }
    if (phase !== "listening") return;
    const t = window.setTimeout(() => void vad.start(), 300);
    return () => window.clearTimeout(t);
  }, [vadState, mode, muted, phase]);

  /** Drop a half-heard segment (mode switch, mute) and go back to listening. */
  const dropSegment = () => {
    if (phase !== "recording") return;
    stopMeter();
    const rec = recRef.current;
    recRef.current = null;
    setToggleRec(false);
    void rec?.stop();
    setPhase("listening");
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    dropSegment();
    setNotice(null);
    setMuted(false);
    setMode(m);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (phase === "recording" && toggleRec) return void endRecording();
    beginRecording();
  };
  const onPointerUp = () => {
    if (phase !== "recording" || toggleRec) return;
    if (performance.now() - pressRef.current < TAP_MS) setToggleRec(true);
    else void endRecording();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (e.repeat) return;
    if (phase === "recording") void endRecording();
    else {
      beginRecording();
      setToggleRec(true);
    }
  };

  // ── Typing ──
  const sendText = async (text: string) => {
    const t = text.trim();
    if (!t || !convRef.current || phase === "processing" || phase === "recording") return;
    speakerRef.current?.stop();
    setNotice(null);
    setDraft("");
    setPhase("processing");
    try {
      await handleTurn(await postJson<TurnResponse>("/api/agent/turn", { conversation_id: convRef.current.id, text_original: t, language: null }));
    } catch (e) {
      setDraft(t);
      failed(e);
    }
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendText(draft);
  };

  const hangUp = async () => {
    speakerRef.current?.stop();
    recRef.current = null;
    const id = convRef.current?.id;
    finish();
    if (!id) return router.push(channelHref);
    try {
      const r = await postJson<{ conversation: Conversation; cases: CaseView[] }>(`/api/conversations/${id}/end`, {});
      if (r.cases.length) setCases((prev) => [...prev.filter((c) => !r.cases.some((x) => x.id === c.id)), ...r.cases]);
    } catch {
      // The call is over for the user either way; the office still sees the drafts.
    }
  };

  // ── Render ──
  if (loadError) {
    return (
      <>
        <MobileHeader title={$t("Gespräch mit Klara")} backHref={channelHref} />
        <main className="flex flex-1 flex-col items-center px-6 py-12 text-center">
          <p className="text-base font-medium text-foreground">{$t("Das Gespräch konnte nicht geladen werden.")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
          <Link href={channelHref} className={cn(BTN_OUTLINE, "mt-4")}>
            {$t("Zum Teamkanal")}
          </Link>
        </main>
      </>
    );
  }
  if (!cfg || (!isNew && !detail)) {
    return (
      <>
        <MobileHeader title={$t("Gespräch mit Klara")} backHref={channelHref} />
        <main className="flex flex-1 flex-col items-center gap-4 px-6 pt-16" aria-busy>
          <Skeleton className="size-28 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </main>
      </>
    );
  }

  if (phase === "ended") {
    return <Ended turns={turns} cases={cases} channelHref={channelHref} teamName={team?.name ?? null} startedAt={detail?.conversation.started_at ?? null} endedAt={detail?.conversation.ended_at ?? null} />;
  }

  if (phase === "ready" || phase === "ringing") {
    const ringing = phase === "ringing";
    return (
      <div className="flex h-dvh flex-col">
        <MobileHeader title={ringing ? $t("Eingehender Anruf") : $t("Gespräch mit Klara")} backHref={channelHref} />
        <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="relative flex size-40 items-center justify-center">
            {ringing ? (
              <>
                <span aria-hidden className="absolute inset-0 animate-[klara-ring_1.8s_var(--ease-out)_infinite] rounded-full border-2 border-primary/50" />
                <span aria-hidden className="absolute inset-0 animate-[klara-ring_1.8s_var(--ease-out)_0.9s_infinite] rounded-full border-2 border-primary/50" />
              </>
            ) : null}
            <KlaraAvatar size={112} mood="idle" />
          </div>
          <h2 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">{ringing ? $t("Klara ruft an") : $t("Klara anrufen")}</h2>
          {team?.name || teamName ? <p className="mt-1 text-base text-muted-foreground">{team?.name ?? teamName}</p> : null}
          <p className="mt-6 max-w-xs text-sm text-pretty text-muted-foreground">
            {$t("Dieses Gespräch wird aufgezeichnet. Klara schreibt daraus die Meldung, die Bauleitung prüft sie.")}
          </p>
          {cfg.stt === "none" ? (
            <p className="mt-3 max-w-xs text-sm text-pretty text-muted-foreground">{$t("Spracherkennung ist noch nicht eingerichtet: Sie schreiben, Klara antwortet mit Stimme.")}</p>
          ) : null}
          {notice ? (
            <p role="alert" className="mt-3 max-w-xs text-sm text-light-red-text">
              {notice}
            </p>
          ) : null}
        </main>
        <div className="grid gap-2 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {ringing ? (
            <div className="grid grid-cols-2 gap-3">
              <Link href={channelHref} className={BTN_OUTLINE}>
                {$t("Ablehnen")}
              </Link>
              <button type="button" onClick={start} className={BTN_PRIMARY}>
                <Phone aria-hidden />
                {$t("Annehmen")}
              </button>
            </div>
          ) : (
            <button type="button" onClick={start} className={cn(BTN_PRIMARY, "min-h-14 text-base")}>
              <Phone aria-hidden />
              {isNew ? $t("Anrufen") : $t("Gespräch fortsetzen")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const mood: KlaraMood = phase === "processing" || phase === "connecting" ? "thinking" : phase === "speaking" ? "speaking" : "listening";
  const lines = cardLines(lang);
  const listeningNow = phase === "listening" && handsFree && !muted && vadState === "ready";
  const status =
    phase === "connecting"
      ? "Verbinde …"
      : phase === "recording"
        ? $t("Klara hört zu")
        : phase === "processing"
          ? $t("Klara denkt nach")
          : phase === "speaking"
            ? $t("Klara spricht")
            : !voice
              ? $t("Schreiben Sie Ihre Antwort.")
              : !handsFree
                ? $t("Halten Sie die Taste und sprechen Sie.")
                : muted
                  ? $t("Stummgeschaltet. Klara hört nicht zu.")
                  : vadState === "ready"
                    ? $t("Sprechen Sie einfach, Klara hört zu.")
                    : $t("Freihändig startet …");
  /** The second line: how to talk in the current mode. */
  const hint =
    !voice || phase === "processing" || phase === "speaking" || phase === "connecting"
      ? null
      : handsFree
        ? muted
          ? $t("Tippen Sie auf das Mikrofon, um weiterzusprechen.")
          : $t("Klara antwortet, wenn Sie eine Pause machen.")
        : phase === "recording"
          ? toggleRec
            ? $t("Tippen Sie zum Senden.")
            : $t("Loslassen zum Senden.")
          : "Kurz tippen startet, erneut tippen sendet.";

  return (
    <div className="flex h-dvh flex-col">
      <MobileHeader
        title={$t("Gespräch mit Klara")}
        subtitle={team?.name}
        backHref={channelHref}
        backLabel={$t("Zum Teamkanal (das Gespräch bleibt offen)")}
        trailing={startedAt ? <Timer since={startedAt} /> : null}
      />

      {/* Stage: Klara and what she is doing */}
      <section aria-label="Klara" className="flex shrink-0 flex-col items-center border-b border-border px-4 pt-2.5 pb-2">
        <div className="relative flex size-[76px] items-center justify-center">
          {listeningNow ? (
            <span aria-hidden className="absolute inset-0 animate-[klara-ring_1.6s_var(--ease-out)_infinite] rounded-full border-2 border-primary/40" />
          ) : null}
          <span aria-hidden className={cn("absolute inset-1 rounded-full border-2 transition-colors duration-200", phase === "recording" ? "border-primary" : "border-transparent")} />
          <KlaraAvatar size={58} mood={mood} talking={phase === "speaking"} />
        </div>
        <div className="flex h-7 items-center" aria-hidden={phase !== "recording"}>
          <div ref={barsRef} className={cn("flex h-6 items-center gap-[3px]", phase === "recording" ? "opacity-100" : "hidden")}>
            {Array.from({ length: BARS }, (_, i) => (
              <span key={i} className="h-full w-[3px] origin-center scale-y-[0.08] rounded-full bg-primary" />
            ))}
          </div>
          {phase !== "recording" ? (
            <p className="flex items-center gap-1 text-[15px] font-medium text-foreground" aria-live="polite">
              {status}
              {phase === "processing" ? <ThinkingDots /> : null}
            </p>
          ) : (
            <span className="sr-only" aria-live="polite">
              {status}
            </span>
          )}
        </div>
        {/* Fixed height, so the transcript does not jump each time the user starts speaking. */}
        <p className="min-h-5 text-center text-sm text-pretty text-muted-foreground">{hint}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{$t("Dieses Gespräch wird aufgezeichnet.")}</p>
      </section>

      {/* Transcript */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <ol aria-label={$t("Gesprächsverlauf")} className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {turns.map((t) => (
              <motion.li
                key={t.id}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              >
                <TranscriptLine t={t} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
        {cases.length ? (
          <div className="mt-4 flex flex-col gap-3">
            {cases.map((c) => (
              <CaseCard key={c.id} c={c} />
            ))}
          </div>
        ) : null}
      </div>

      {/* Dock */}
      <div className="shrink-0 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {notice ? (
          <p role="alert" className="mb-2 text-sm leading-snug text-light-red-text">
            {notice}
          </p>
        ) : null}
        {awaitingConfirm && phase === "listening" ? (
          <div className="mb-3 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => void sendText(lines.confirmYes)} className={BTN_PRIMARY} lang={lang}>
              {lines.confirmYes}
            </button>
            <button
              type="button"
              onClick={() => {
                setTyping(true);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              className={BTN_OUTLINE}
              lang={lang}
            >
              {lines.confirmChange}
            </button>
          </div>
        ) : null}
        {typing || !voice ? (
          <form onSubmit={onSubmit} className="mb-3 flex items-center gap-2">
            <label htmlFor="call-input" className="sr-only">
              {$t("Antwort an Klara")}
            </label>
            <input
              id="call-input"
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={$t("Antwort an Klara")}
              autoComplete="off"
              enterKeyHint="send"
              className="h-12 min-w-0 flex-1 rounded-full border border-border bg-surface px-4 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              aria-label={$t("Senden")}
              disabled={!draft.trim() || phase === "processing"}
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40"
            >
              <ArrowUp className="size-5" aria-hidden />
            </button>
          </form>
        ) : null}
        {voice ? (
          <>
            {vadState !== "failed" ? (
              <div role="group" aria-label={$t("Sprechmodus")} className="mb-3 grid grid-cols-2 rounded-full border border-border bg-muted p-0.5">
                {(
                  [
                    ["handsfree", "Freihändig"],
                    ["ptt", "Push-to-Talk"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    aria-pressed={mode === m}
                    className={cn(
                      "h-12 rounded-full text-[15px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "transition-[background-color,color,box-shadow] duration-150 ease-[var(--ease-out)]",
                      mode === m ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {$t(label)}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center">
              <div className="flex items-center gap-3 justify-self-start">
                <button
                  type="button"
                  onClick={() => {
                    setTyping((v) => !v);
                    if (!typing) requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  aria-pressed={typing}
                  aria-label={$t("Tippen statt sprechen")}
                  className={cn(
                    "flex size-14 items-center justify-center rounded-full border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    typing ? "bg-muted text-foreground" : "bg-background text-foreground hover:bg-muted",
                  )}
                >
                  <Keyboard className="size-6" aria-hidden />
                </button>
                <CameraButton busy={photoBusy} onPhoto={(f) => void sendPhoto(f)} />
              </div>
              {handsFree ? (
                <button
                  type="button"
                  onClick={() => {
                    dropSegment();
                    setMuted((m) => !m);
                  }}
                  aria-label={$t("Stummschalten")}
                  aria-pressed={muted}
                  className={cn(
                    "flex size-20 items-center justify-center rounded-full outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.96]",
                    muted
                      ? "border-2 border-zinc-900 bg-background text-foreground"
                      : phase === "recording"
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/25"
                        : "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                >
                  {muted ? <MicOff className="size-8" aria-hidden /> : <Mic className="size-8" aria-hidden />}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={phase !== "listening" && phase !== "recording"}
                  onPointerDown={onPointerDown}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onKeyDown={onKeyDown}
                  onContextMenu={(e) => e.preventDefault()}
                  aria-label={phase === "recording" ? $t("Senden") : $t("Halten und sprechen")}
                  aria-pressed={phase === "recording"}
                  className={cn(
                    "flex size-20 touch-none items-center justify-center rounded-full outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40 [-webkit-touch-callout:none]",
                    "transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.96]",
                    phase === "recording" ? "bg-primary text-primary-foreground ring-4 ring-primary/25" : "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                >
                  <Mic className="size-8" aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={hangUp}
                aria-label={$t("Auflegen")}
                className="flex size-14 items-center justify-center justify-self-end rounded-full bg-zinc-900 text-white outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <PhoneOff className="size-6" aria-hidden />
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center gap-6">
            <CameraButton busy={photoBusy} onPhoto={(f) => void sendPhoto(f)} />
            <button
              type="button"
              onClick={hangUp}
              aria-label={$t("Auflegen")}
              className="flex size-14 items-center justify-center rounded-full bg-zinc-900 text-white outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <PhoneOff className="size-6" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TranscriptLine({ t }: { t: Turn }) {
  const subtitle = t.language && t.language !== "de" && t.text_de && t.text_de !== t.text_original ? t.text_de : null;
  if (t.role === "user") {
    return (
      <div className="flex flex-col items-end">
        <p lang={t.language ?? undefined} className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-[15px] leading-snug text-foreground">
          <span className="sr-only">Sie: </span>
          {t.text_original}
        </p>
        {subtitle ? (
          <p lang="de" className="mt-1 max-w-[85%] text-right text-sm leading-snug text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <KlaraAvatar size={24} className="mt-0.5" />
      <div className="min-w-0 max-w-[85%]">
        <p lang={t.language ?? undefined} className="text-[15px] leading-snug text-foreground">
          <span className="sr-only">{$t("Klara:")} </span>
          {t.text_original}
        </p>
        {subtitle ? (
          <p lang="de" className="mt-1 text-sm leading-snug text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span aria-hidden className="inline-flex gap-0.5">
      {[0, 160, 320].map((d) => (
        <span key={d} className="size-1 animate-[klara-dot_1s_ease-in-out_infinite] rounded-full bg-foreground" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

function Timer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <span className="mr-1 font-mono text-sm text-muted-foreground tabular-nums" aria-label={$t("Gesprächsdauer {m} Minuten {s} Sekunden", { m: Math.floor(s / 60), s: s % 60 })}>
      {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

function Ended({
  turns,
  cases,
  channelHref,
  teamName,
}: {
  turns: Turn[];
  cases: CaseView[];
  channelHref: string;
  teamName: string | null;
  startedAt: string | null;
  endedAt: string | null;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <MobileHeader title={$t("Gespräch beendet")} subtitle={teamName} backHref={channelHref} backLabel="Zum Teamkanal" />
      <main className="flex-1 px-4 pt-5 pb-8">
        <div className="flex items-center gap-3">
          <KlaraAvatar size={44} />
          <p className="text-[17px] leading-snug font-medium text-foreground">
            {cases.length === 1
              ? $t("Klara hat eine Meldung angelegt.")
              : cases.length
                ? $t("Klara hat {n} Meldungen angelegt.", { n: cases.length })
                : $t("Aus diesem Gespräch ist keine Meldung entstanden.")}
          </p>
        </div>
        {cases.length ? (
          <div className="mt-4 flex flex-col gap-3">
            {cases.map((c) => (
              <CaseCard key={c.id} c={c} />
            ))}
          </div>
        ) : null}
        {turns.length ? (
          <section aria-labelledby="transcript-h" className="mt-8">
            <h2 id="transcript-h" className="text-[15px] font-semibold text-foreground">
              {$t("Gesprächsprotokoll")}
            </h2>
            <ol className="mt-3 flex flex-col gap-3">
              {turns.map((t) => (
                <li key={t.id}>
                  <TranscriptLine t={t} />
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </main>
      <div className="sticky bottom-0 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Link href={channelHref} className={cn(BTN_PRIMARY, "w-full")}>
          {$t("Zum Teamkanal")}
        </Link>
      </div>
    </div>
  );
}

/** "Foto" on the call screen: opens the phone's camera; the picture goes to the case being talked about. */
function CameraButton({ busy, onPhoto }: { busy: boolean; onPhoto: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPhoto(file);
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        aria-label={busy ? $t("Foto wird gesendet") : $t("Foto aufnehmen")}
        aria-busy={busy}
        className="flex size-14 items-center justify-center rounded-full border border-border bg-background text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
      >
        <Camera className="size-6" aria-hidden />
      </button>
    </>
  );
}
