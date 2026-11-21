"use client";

import { AlertCircle, Building2, Check, CircleCheck, Clock, FileText, ImageIcon, Mic, Reply, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { cn } from "@/lib/utils";
import {
  CALL_SCRIPT,
  CLARIFY_MESSAGE_DE,
  CLARIFY_MESSAGE_EN,
  CLARIFY_RECIPIENTS,
  CLARIFY_REQUEST,
  DOC_COMPLETION,
  DOC_REFERENCE,
  SITES,
} from "../pitch-story";
import { EASE_OUT, u } from "../stage";
import { CaseDocument, PAPER_SHADOW, STATUS_COLORS, type DocStatus } from "./CaseDocument";
import { appScaleVars, LightScene, NEXT_ACTION, useBeat, type SceneProps } from "./scene-parts";

/**
 * Beats, in click order (spec update 2026-11-21): 3.1 = recipient (Clarify
 * panel ready), 3.2 = sent, waiting, 3.3 = the site manager replied (only
 * the next key or "S"), 3.4 = validated. Everything derives from the beat,
 * so ← restores each earlier state exactly.
 */
export const OFFICE_BEATS = { open: 1, transcript: 2, closeTranscript: 3, clarify: 4, recipient: 5, sent: 6, replied: 7, validated: 8 } as const;
const B = OFFICE_BEATS;

const TRANSCRIPT_TIMES = ["0:00", "0:07", "0:13", "0:16", "0:20", "0:22", "0:33", "0:35"];
const PRESENT = ["Start time", "Cause", "Responsible party (client)", "Affected works", "Crew"];
const MISSING = [
  { label: "Expected duration", added: `${DOC_COMPLETION.dauer}` },
  { label: "Photo evidence", added: "1 photo" },
];

const ease = { duration: 0.3, ease: EASE_OUT };

/**
 * Scene 3 – the office side (REPLAY, interactive). The control that comes
 * next carries a ring and `data-next`: clicking it (or the presenter's next
 * key) advances; other clicks in this scene do nothing.
 */
export function AdminScene({ phase, step, revealMode }: SceneProps) {
  const beat = useBeat(phase, step, revealMode, [1200, 3800, 6400, 8000, 11400, 14000, 17000, 20000]);

  // Voice input: the request appears word by word.
  const words = CLARIFY_REQUEST.split(" ");
  const [heard, setHeard] = useState(0);
  useEffect(() => {
    if (phase !== "enter" || beat !== B.clarify) return;
    const timer = window.setInterval(() => setHeard((n) => Math.min(n + 1, words.length)), 120);
    return () => window.clearInterval(timer);
  }, [phase, beat, words.length]);
  const heardWords = beat > B.clarify ? words.length : beat === B.clarify ? heard : 0;

  const complete = beat >= B.replied;
  const status: DocStatus = beat >= B.validated ? "validated" : complete ? "ready" : "open";
  const opened = beat >= B.open;
  const composer = beat >= B.clarify && beat < B.sent;
  const isNext = (b: number) => beat === b - 1;
  const next = (b: number) => (isNext(b) ? NEXT_ACTION : "");
  const nextAttr = (b: number) => (isNext(b) ? { "data-next": "" } : {});

  return (
    <LightScene label="Scene 3 – the office" phase={phase}>
      <div
        className={cn("absolute flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white", PAPER_SHADOW)}
        style={{ left: u(120), top: u(80), width: u(1680), height: u(920) }}
      >
        {/* Top bar */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 px-4">
          <KlaraAvatar size={28} className="size-7" />
          <span className="text-sm font-semibold">Klara</span>
          <span className="text-sm text-zinc-400">/</span>
          <span className="text-sm text-zinc-600">{opened ? "Wohnanlage Riem / Estrich" : "Muster Bau GmbH"}</span>
          <span className="ml-auto flex items-center gap-2 text-sm text-zinc-600">
            Office
            <span className="flex size-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-white">TB</span>
          </span>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Project tree */}
          <nav aria-label="Sites" className="flex w-52 shrink-0 flex-col gap-3 border-r border-zinc-200 bg-zinc-50 p-3">
            <p className="px-2 text-xs text-zinc-500">Sites</p>
            {SITES.map((site) => (
              <div key={site.id} className="flex flex-col gap-0.5">
                <p className="flex items-start gap-2 px-2 py-1 text-sm leading-tight font-medium text-zinc-900">
                  <Building2 className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
                  <span>
                    <span className="font-mono text-zinc-500">{site.id}</span> · {site.name}
                  </span>
                </p>
                {site.teams.map((team) => {
                  const target = site.id === "B" && team === "Estrich";
                  const selected = target && opened;
                  return (
                    <button
                      key={team}
                      type="button"
                      {...(target ? nextAttr(B.open) : {})}
                      className={cn(
                        "ml-6 flex items-center justify-between rounded-md px-2 py-1 text-left text-sm text-zinc-600",
                        selected && "bg-white font-medium text-zinc-900 ring-1 ring-zinc-200",
                        target && next(B.open),
                      )}
                    >
                      {team}
                      {target && !selected && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-white">
                          1<span className="sr-only"> new case</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Case */}
          <main className="relative flex min-w-0 flex-1 flex-col bg-zinc-50/60">
            {!opened ? (
              <div className="m-auto flex max-w-sm flex-col items-center gap-2 text-center">
                <FileText className="size-8 text-zinc-300" aria-hidden />
                <p className="text-base font-medium">1 new report from Team Estrich</p>
                <p className="text-sm text-zinc-500">Open the team in Wohnanlage Riem to review it.</p>
              </div>
            ) : (
              <motion.div className="flex min-h-0 flex-1 flex-col" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={ease}>
                <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold whitespace-nowrap">Hindrance · screed, 2nd floor</p>
                    <p className="text-xs whitespace-nowrap text-zinc-500">
                      <span className="font-mono">{DOC_REFERENCE}</span> · from the call
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Button variant="outline" className={next(B.transcript)} {...nextAttr(B.transcript)}>
                      View transcript
                    </Button>
                    <Button variant="outline" className={next(B.clarify)} {...nextAttr(B.clarify)}>
                      <Mic aria-hidden /> Clarify
                    </Button>
                    <ValidateButton complete={complete} validated={status === "validated"} isNext={isNext(B.validated)} />
                  </div>
                </div>
                <div className="relative min-h-0 flex-1 overflow-hidden p-5" style={appScaleVars(1.35)}>
                  <CaseDocument heardUpTo={CALL_SCRIPT.length - 1} complete={complete} status={status} className="mx-auto max-w-3xl" />
                </div>

                <AnimatePresence>
                  {beat === B.transcript && (
                    <motion.div
                      key="scrim"
                      aria-hidden
                      className="absolute inset-0 bg-white/70"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={ease}
                    />
                  )}
                </AnimatePresence>

                {/* Clarify panel (3.1); closes on Send: down 16 px + fade, 300 ms */}
                <AnimatePresence>
                  {composer && (
                    <motion.section
                      key="composer"
                      aria-label="Clarify"
                      className="absolute inset-x-5 bottom-5 flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 16 }}
                      transition={ease}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                          <Mic className="size-5" aria-hidden />
                        </span>
                        <p className="min-h-[1.4em] pt-1.5 text-base leading-snug">
                          {words.slice(0, heardWords).join(" ")}
                          {heardWords < words.length && <span className="text-zinc-400"> …</span>}
                        </p>
                      </div>

                      {heardWords === words.length && (
                        <motion.div className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={ease}>
                          <span className="mr-1 text-sm text-zinc-500">Send to</span>
                          {CLARIFY_RECIPIENTS.map((r, i) => {
                            const chosen = i === 0 && beat >= B.recipient;
                            return (
                              <button
                                key={r}
                                type="button"
                                {...(i === 0 ? nextAttr(B.recipient) : {})}
                                className={cn(
                                  "flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-700",
                                  chosen && "border-primary bg-blue-50 text-primary",
                                  i === 0 && next(B.recipient),
                                )}
                              >
                                {chosen && <Check className="size-3.5" strokeWidth={2.5} aria-hidden />}
                                {r}
                              </button>
                            );
                          })}
                        </motion.div>
                      )}

                      {beat >= B.recipient && (
                        <motion.div className="flex items-end gap-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...ease, delay: 0.25 }}>
                          <div className="min-w-0 flex-1 rounded-lg bg-zinc-50 px-4 py-3">
                            <p lang="de" className="text-sm leading-snug text-zinc-900">{CLARIFY_MESSAGE_DE}</p>
                            <p className="mt-1 text-xs leading-snug text-zinc-500">
                              <span className="mr-1.5 font-mono">EN</span>
                              {CLARIFY_MESSAGE_EN}
                            </p>
                          </div>
                          <Button size="lg" className={next(B.sent)} {...nextAttr(B.sent)}>
                            Send
                          </Button>
                        </motion.div>
                      )}
                    </motion.section>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </main>

          {/* Klara panel */}
          {opened && (
            <motion.aside
              aria-label="Klara check"
              className="relative flex w-72 shrink-0 flex-col gap-5 border-l border-zinc-200 bg-white p-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...ease, delay: 0.1 }}
            >
              <div className="flex items-center gap-2">
                <KlaraAvatar size={28} className="size-7" />
                <span className="text-sm font-semibold">Klara check</span>
              </div>
              <StatusLine beat={beat} />

              {/* 3.2: waiting → 3.3: the reply */}
              <AnimatePresence mode="popLayout" initial={false}>
                {beat === B.sent && (
                  <motion.p
                    key="pending"
                    role="status"
                    className="flex items-start gap-2 text-sm leading-snug text-zinc-600"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={ease}
                  >
                    <Clock className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
                    <span>
                      Request sent <span className="font-mono">07:52</span> · Klara asks him in his language
                    </span>
                  </motion.p>
                )}
                {complete && (
                  <motion.div
                    key="reply"
                    role="status"
                    className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={ease}
                  >
                    <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-400">
                      <ImageIcon className="size-5" />
                    </span>
                    <div className="min-w-0 text-sm leading-snug">
                      <p className="flex items-center gap-1.5 font-medium text-zinc-900">
                        <Reply className="size-4 text-primary" aria-hidden /> Site manager replied
                      </p>
                      <p className="text-zinc-500">
                        <span className="font-mono">07:58</span> · {DOC_COMPLETION.dauer} · 1 photo
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <section className="flex flex-col gap-2">
                <h4 className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <CircleCheck className="size-3.5" aria-hidden /> Present
                </h4>
                {PRESENT.map((p) => (
                  <CheckRow key={p} ok label={p} />
                ))}
                {complete && MISSING.map((m) => <CheckRow key={m.label} ok label={m.label} detail={m.added} fresh />)}
              </section>

              <section className="flex flex-col gap-2">
                <h4 className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <AlertCircle className="size-3.5" aria-hidden /> Missing
                </h4>
                {complete ? (
                  <p className="text-sm text-zinc-500">Nothing missing.</p>
                ) : (
                  MISSING.map((m) => <CheckRow key={m.label} label={m.label} />)
                )}
              </section>

              {/* Transcript: proof of where every fact came from */}
              <AnimatePresence>
                {beat === B.transcript && (
                  <motion.section
                    key="transcript"
                    aria-label="Call transcript"
                    className="absolute inset-y-0 right-0 flex w-[165%] flex-col gap-3 overflow-hidden border-l border-zinc-200 bg-white p-5 shadow-2xl"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={ease}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        Call transcript <span className="font-normal text-zinc-500">· Team Estrich, 07:41</span>
                      </p>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label="Close transcript"
                        className={next(B.closeTranscript)}
                        {...nextAttr(B.closeTranscript)}
                      >
                        <X aria-hidden />
                      </Button>
                    </div>
                    <ol className="flex flex-col gap-2.5">
                      {CALL_SCRIPT.map((line, i) => (
                        <li key={i} className="grid grid-cols-[3.2em_1fr] gap-2 text-xs leading-snug">
                          <span className="font-mono text-zinc-500">{TRANSCRIPT_TIMES[i]}</span>
                          <span className="text-zinc-800">
                            <span className="font-medium">{line.who === "klara" ? "Klara" : "Polier (EN)"}:</span> {line.text}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </motion.section>
                )}
              </AnimatePresence>
            </motion.aside>
          )}
        </div>

        {/* Toasts, bottom right, 2.5 s each */}
        <div className="pointer-events-none absolute right-5 bottom-5 flex flex-col items-end gap-2">
          {beat === B.sent && <TimedToast key="sent">Sent to site manager · <span className="font-mono">07:52</span></TimedToast>}
          {beat === B.validated && <TimedToast key="validated">Validiert · ready to send to Wohnbau Riem GmbH</TimedToast>}
        </div>
      </div>
    </LightScene>
  );
}

/** Disabled until the reply completes the case; one soft pulse when it unlocks. */
function ValidateButton({ complete, validated, isNext }: { complete: boolean; validated: boolean; isNext: boolean }) {
  return (
    <motion.span
      className="rounded-lg"
      initial={false}
      animate={
        complete && !validated
          ? { boxShadow: ["0 0 0 0 rgb(37 99 235 / 0.45)", "0 0 0 10px rgb(37 99 235 / 0)"] }
          : { boxShadow: "0 0 0 0 rgb(37 99 235 / 0)" }
      }
      transition={{ duration: 0.9, ease: EASE_OUT }}
    >
      <Button
        aria-disabled={!complete || undefined}
        tabIndex={complete ? undefined : -1}
        className={cn(!complete && "pointer-events-none opacity-50", isNext && NEXT_ACTION)}
        {...(isNext ? { "data-next": "" } : {})}
      >
        {validated ? (
          <>
            <Check aria-hidden /> Validated
          </>
        ) : (
          "Validate"
        )}
      </Button>
    </motion.span>
  );
}

/** A toast that shows for `ms`, then leaves; re-entering the beat shows it again. */
function TimedToast({ children, ms = 2500 }: { children: ReactNode; ms?: number }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), ms);
    return () => window.clearTimeout(timer);
  }, [ms]);
  return (
    <AnimatePresence>
      {visible && (
        <motion.p
          role="status"
          className="flex max-w-64 items-start gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm leading-snug text-zinc-900 shadow-lg"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={ease}
        >
          <Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.5} aria-hidden />
          <span>{children}</span>
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/** Klara's verdict: amber while something is missing, green once complete (300 ms colour crossfade). */
function StatusLine({ beat }: { beat: number }) {
  const green = beat >= B.replied;
  const text =
    beat >= B.validated
      ? <>Validiert by Office · <span className="font-mono">07:59</span></>
      : green
        ? "Complete · ready to validate"
        : beat === B.sent
          ? "2 missing · waiting for site manager"
          : "2 missing · expected duration, photo";
  const c = green ? STATUS_COLORS.green : STATUS_COLORS.amber;
  return (
    <motion.p
      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
      initial={false}
      animate={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      {beat >= B.validated ? (
        <Check className="size-4 shrink-0" strokeWidth={2.5} aria-hidden />
      ) : (
        <motion.span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          initial={false}
          animate={{ backgroundColor: c.dot }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        />
      )}
      <span>{text}</span>
    </motion.p>
  );
}

function CheckRow({ ok = false, label, detail, fresh = false }: { ok?: boolean; label: string; detail?: string; fresh?: boolean }) {
  return (
    <motion.p
      className="flex items-start gap-2 text-sm leading-snug"
      initial={fresh ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={ease}
    >
      {ok ? (
        <Check className="mt-0.5 size-4 shrink-0 text-light-green" strokeWidth={2.5} aria-hidden />
      ) : (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-light-yellow" aria-hidden />
      )}
      <span className={ok ? "text-zinc-800" : "text-light-yellow-text"}>
        {label}
        {detail && <span className="text-zinc-500"> · {detail}</span>}
      </span>
    </motion.p>
  );
}
