"use client";

import { Check, Phone } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { cn } from "@/lib/utils";
import { CALL_TIMING, readingTimeMs, turnSchedule } from "../call-timing";
import { CALL_CAPABILITIES, CALL_EXCHANGES, CALL_SCRIPT, type CallLine } from "../pitch-story";
import { EASE_IN_OUT, EASE_OUT, u } from "../stage";
import { CaseDocument } from "./CaseDocument";
import { LightScene, TypingDots, type SceneProps } from "./scene-parts";

/** Document box (design px); after the call it slides to the left column. */
const DOC = { left: 980, top: 150, width: 780 };
const DOC_SHIFT = `${-((DOC.left - 160) / DOC.width) * 100}%`;

/** Inside a turn: 0 the foreman spoke · 1 document updated, Klara typing · 2 Klara replied. */
type Stage = 0 | 1 | 2;
type Timeline = { turn: number; stage: Stage; after: boolean };
const START: Timeline = { turn: 0, stage: 2, after: false };
const END: Timeline = { turn: CALL_EXCHANGES, stage: 2, after: true };

/** Measured on screen (?debug=1 and the timing check): ms on performance.now(). */
type TurnLog = { foreman?: number; doc?: number; typing?: number; reply?: number };
declare global {
  interface Window {
    __klaraCallTimings?: TurnLog[];
  }
}

/**
 * Scene 2 – the call (REPLAY), paced like a real conversation.
 * Each turn: the foreman's message appears; 1.5 s later the document fields it
 * mentions fill and Klara starts typing; 1 s after that her full reply
 * replaces the dots. 1 s after her last reply the document moves left.
 *
 * One press starts the call and the whole dialogue plays by itself: the next
 * foreman message follows Klara's reply after reading time. Presses during
 * the call are ignored; the press after it moves on. AUTO ("A") also starts
 * the call without a press.
 */
export function CallScene({ phase, autoPace = false, debug = false, arrivedBack = false, registerController }: SceneProps) {
  const [tl, setTl] = useState<Timeline>(arrivedBack ? END : START);
  const requested = useRef(arrivedBack ? CALL_EXCHANGES : 0);
  const tlRef = useRef(tl);
  const autoRef = useRef(autoPace);
  // Set by the first press: the rest of the dialogue then runs by itself.
  const [running, setRunning] = useState(arrivedBack);
  useEffect(() => {
    tlRef.current = tl;
    autoRef.current = autoPace;
  }, [tl, autoPace]);

  const start = useCallback((turn: number) => setTl({ turn, stage: 0, after: false }), []);

  // Presenter presses go to the scene first.
  useEffect(() => {
    registerController?.({
      onNext: () => {
        const t = tlRef.current;
        if (t.after) return false; // done: PitchFlow moves on
        // First press: the whole call plays; later presses wait for its end.
        if (t.turn === 0) {
          requested.current = CALL_EXCHANGES;
          setRunning(true);
          start(1);
        }
        return true;
      },
      onBack: () => {
        const t = tlRef.current;
        if (t.turn === 0) return false;
        requested.current = 0;
        setRunning(false);
        setTl(START);
        return true;
      },
    });
    return () => registerController?.(null);
  }, [registerController, start]);

  // The turn engine: every step is timed from the moment the previous one showed.
  useEffect(() => {
    if (phase !== "enter" || tl.after) return;
    const { turn, stage } = tl;
    const s = turnSchedule(0); // REPLAY: no backend times → exact minimums
    let timer: number | undefined;
    const after = (ms: number, fn: () => void) => (timer = window.setTimeout(fn, ms));
    if (turn === 0) {
      if (autoPace) after(CALL_TIMING.autoStartMs, () => start(1));
    } else if (stage === 0) {
      after(s.docAt, () => setTl({ turn, stage: 1, after: false }));
    } else if (stage === 1) {
      after(s.replyAt - s.typingAt, () => setTl({ turn, stage: 2, after: false }));
    } else if (turn >= CALL_EXCHANGES) {
      after(CALL_TIMING.afterLastReplyMs, () => setTl(END));
    } else if (autoPace || running) {
      after(readingTimeMs(CALL_SCRIPT[turn * 2 - 1].text), () => {
        requested.current = Math.max(requested.current, turn + 1);
        start(turn + 1);
      });
    } else if (requested.current > turn) {
      after(CALL_TIMING.queueGapMs, () => start(turn + 1));
    }
    return () => window.clearTimeout(timer);
  }, [phase, tl, autoPace, running, start]);

  // Measure when each part actually reached the screen (next frame after commit).
  const [log, setLog] = useState<TurnLog[]>([]);
  useEffect(() => {
    if (tl.turn === 0 || tl.after) return;
    const { turn, stage } = tl;
    const frame = requestAnimationFrame(() => {
      const now = performance.now();
      setLog((prev) => {
        const next = [...prev];
        const entry = { ...(stage === 0 ? {} : next[turn - 1]) };
        if (stage === 0) entry.foreman = now;
        if (stage === 1) entry.doc = entry.typing = now;
        if (stage === 2) entry.reply = now;
        next[turn - 1] = entry;
        window.__klaraCallTimings = next;
        return next;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [tl]);

  const { turn, stage, after } = tl;
  const foremanLine = (turn - 1) * 2;
  const shown = turn === 0 ? 0 : foremanLine + (stage === 2 ? 2 : 1);
  // The document takes the facts of the whole turn at stage 1 (never earlier).
  const heardUpTo = turn === 0 ? -1 : foremanLine - 1 + (stage >= 1 ? 2 : 0);
  const typing = turn > 0 && stage === 1;
  const done = heardUpTo >= CALL_SCRIPT.length - 1;

  // Keep the newest bubble in view.
  const chatRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [shown, typing]);

  return (
    <LightScene label="Scene 2 – the call" phase={phase}>
      <div className="absolute flex items-center gap-4" style={{ left: u(160), top: u(72) }}>
        <LanguageBadge
          waiting={phase === "enter" && turn === 0}
          detected={turn === 0 ? null : (CALL_SCRIPT[foremanLine]?.lang ?? "en").toUpperCase()}
        />
        <span className="flex items-center gap-2 text-sm text-zinc-600">
          <Phone className="size-4 text-primary" aria-hidden />
          Call · Foreman, Team Estrich · Wohnanlage Riem
        </span>
        {autoPace && <span className="rounded-sm bg-zinc-200 px-1.5 font-mono text-xs text-zinc-600">AUTO</span>}
      </div>

      {/* Chat (left) */}
      <motion.div
        ref={chatRef}
        aria-label="Call transcript"
        aria-live="polite"
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}
        className={cn(
          "absolute flex flex-col gap-4 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          scrolled && "mask-[linear-gradient(to_bottom,transparent,#000_10%)]",
        )}
        style={{ left: u(160), top: u(150), width: u(720), bottom: u(80) }}
        initial={false}
        animate={after ? { opacity: 0, filter: "blur(6px)" } : { opacity: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.25, ease: EASE_OUT }}
      >
        {/* One list, so the typing bubble and Klara's message are the same element. */}
        {CALL_SCRIPT.slice(0, shown + (typing ? 1 : 0)).map((line, i) =>
          line.who === "klara" ? (
            <KlaraBubble key={i} index={i} text={i < shown ? line.text : null} />
          ) : (
            <ForemanBubble key={i} index={i} line={line} />
          ),
        )}
      </motion.div>

      {/* German document (right, then left) */}
      <motion.div
        className="absolute"
        style={{ left: u(DOC.left), top: u(DOC.top), width: u(DOC.width) }}
        initial={false}
        animate={{ x: after ? DOC_SHIFT : "0%" }}
        transition={{ duration: 0.7, ease: EASE_IN_OUT, delay: after ? 0.15 : 0 }}
      >
        <CaseDocument heardUpTo={heardUpTo} status={done ? "open" : "building"} />
      </motion.div>

      {/* After the call: what just happened, one by one */}
      {after && (
        <ul className="absolute flex flex-col" style={{ left: u(1040), top: u(300), width: u(720), gap: u(34) }}>
          {CALL_CAPABILITIES.map((text, i) => (
            <motion.li
              key={text}
              className="flex items-start text-zinc-900"
              style={{ gap: u(22), fontSize: u(30), lineHeight: 1.3 }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.75 + i * 0.38 }}
            >
              <span
                aria-hidden
                className="flex shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary"
                style={{ width: u(44), height: u(44), marginTop: u(-2) }}
              >
                <Check style={{ width: u(24), height: u(24) }} strokeWidth={2.5} />
              </span>
              <span className="tracking-[-0.01em] text-balance">{text}</span>
            </motion.li>
          ))}
        </ul>
      )}

      {debug && <TimingOverlay log={log} />}
    </LightScene>
  );
}

function ForemanBubble({ line, index }: { line: CallLine; index: number }) {
  return (
    <motion.div
      data-line={index}
      data-who="foreman"
      className="flex shrink-0 flex-col items-end gap-1.5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
    >
      <span className="flex items-center gap-2 text-xs text-zinc-500">
        Polier
        <span className="rounded-sm border border-zinc-300 bg-white px-1.5 font-mono text-[0.85em] text-zinc-700">EN</span>
      </span>
      <p data-text lang="en" className="max-w-[88%] rounded-2xl rounded-br-md bg-zinc-100 px-4 py-2.5 text-sm leading-snug text-pretty text-zinc-900">
        {line.text}
      </p>
    </motion.div>
  );
}

/**
 * Klara's bubble. While she types it holds the three dots; her full reply
 * then replaces them in the same bubble (150 ms crossfade) and the bubble
 * grows to fit with a layout animation, so nothing below it jumps.
 */
function KlaraBubble({ text, index }: { text: string | null; index: number }) {
  return (
    <motion.div
      data-line={index}
      data-who="klara"
      data-typing={text === null || undefined}
      className="flex shrink-0 items-start gap-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
    >
      <KlaraAvatar size={36} className="size-9" title="Klara" />
      <motion.div
        layout
        transition={{ layout: { duration: 0.15, ease: EASE_OUT } }}
        className="max-w-[88%] overflow-hidden rounded-2xl rounded-tl-md border border-zinc-200 bg-white"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {text === null ? (
            <motion.span
              key="dots"
              layout="position"
              aria-label="Klara is typing"
              role="status"
              className="flex px-4 py-3.5"
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <TypingDots />
            </motion.span>
          ) : (
            <motion.p
              key="text"
              data-text
              layout="position"
              className="px-4 py-2.5 text-sm leading-snug text-pretty text-zinc-900"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              // The bubble grows first, then the whole reply fades in at once (no wipe).
              transition={{ duration: 0.15, delay: 0.15 }}
            >
              {text}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

/** ?debug=1 — measured gaps per turn (screen time, next frame after each update). */
function TimingOverlay({ log }: { log: TurnLog[] }) {
  const ms = (a?: number, b?: number) => (a !== undefined && b !== undefined ? `${Math.round(b - a)} ms` : "—");
  return (
    <div className="absolute right-4 bottom-4 rounded-md border border-zinc-300 bg-white/95 p-3 font-mono text-xs text-zinc-800 shadow-sm">
      <p className="mb-1 font-semibold">Call timing (target 1500 / 0 / 1500)</p>
      <table>
        <thead>
          <tr className="text-zinc-500">
            <th className="pr-3 text-left font-normal">Turn</th>
            <th className="pr-3 text-right font-normal">foreman→doc</th>
            <th className="pr-3 text-right font-normal">doc→typing</th>
            <th className="text-right font-normal">typing→Klara</th>
          </tr>
        </thead>
        <tbody>
          {log.map((t, i) => (
            <tr key={i}>
              <td className="pr-3">{i + 1}</td>
              <td className="pr-3 text-right">{ms(t.foreman, t.doc)}</td>
              <td className="pr-3 text-right">{ms(t.doc, t.typing)}</td>
              <td className="text-right">{ms(t.typing, t.reply)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Source languages shown in the badge (the call works in more). */
const SOURCE_LANGS = ["EN", "PL", "RO", "TR", "HR"] as const;
/** The one-pass scan while the call waits: PL → RO → TR → HR → EN, 600 ms each. */
const SCAN = ["PL", "RO", "TR", "HR", "EN"] as const;
const SOURCES_TIP = "English · Polski · Română · Türkçe · Hrvatski/Bosanski/Srpski — und weitere Sprachen";

/**
 * "EN · PL · RO · TR · HR → DE". While the call waits, the source chips
 * light up one by one (one pass); with the first foreman message the
 * highlight locks on the detected language and "Sprache erkannt: EN" shows.
 * A later message in another language moves the highlight there.
 */
function LanguageBadge({ waiting, detected }: { waiting: boolean; detected: string | null }) {
  const [scan, setScan] = useState<number>(-1);
  useEffect(() => {
    if (!waiting) return;
    const timers = SCAN.map((_, i) => window.setTimeout(() => setScan(i), 300 + i * 600));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [waiting]);
  const lit = detected ?? (waiting && scan >= 0 ? SCAN[scan] : null);
  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1" title={SOURCES_TIP} aria-label={`Quellsprachen: ${SOURCES_TIP}`}>
          {SOURCE_LANGS.map((l) => (
            <span
              key={l}
              className={cn(
                "rounded-md border px-1.5 py-0.5 font-mono text-xs transition-colors duration-200",
                l === lit ? "border-primary bg-primary text-white" : detected ? "border-zinc-200 bg-white text-zinc-400" : "border-zinc-300 bg-white text-zinc-700",
              )}
            >
              {l}
            </span>
          ))}
        </span>
        <span aria-hidden className="text-zinc-500">
          →
        </span>
        <span className="rounded-md bg-zinc-900 px-1.5 py-0.5 font-mono text-xs text-white">DE</span>
      </div>
      <AnimatePresence>
        {detected ? (
          <motion.span
            key="detected"
            role="status"
            className="absolute top-full left-0 mt-1.5 whitespace-nowrap font-mono text-xs text-zinc-500"
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            Sprache erkannt: {detected}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
