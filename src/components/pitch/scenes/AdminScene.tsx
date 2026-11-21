"use client";

import { AlertCircle, Building2, Check, CircleCheck, FileText, ImageIcon, Mic, Reply, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
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
import { CaseDocument, PAPER_SHADOW, type DocStatus } from "./CaseDocument";
import { appScaleVars, LightScene, NEXT_ACTION, useBeat, type SceneProps } from "./scene-parts";

/** Beats, in click order. */
const B = { open: 1, transcript: 2, closeTranscript: 3, clarify: 4, recipient: 5, send: 6, validate: 7 } as const;

/** The site manager's answer lands this long after "Send" (REPLAY). */
const UPDATE_DELAY_MS = 1800;
const TRANSCRIPT_TIMES = ["0:00", "0:07", "0:13", "0:16", "0:20", "0:22", "0:33", "0:35"];

const PRESENT = ["Start time", "Cause", "Responsible party (client)", "Affected works", "Crew"];
const MISSING = [
  { label: "Expected duration", added: `${DOC_COMPLETION.dauer}` },
  { label: "Photo evidence", added: "1 photo" },
];

const ease = { duration: 0.3, ease: EASE_OUT };

/**
 * Scene 3 – the office side (REPLAY, interactive). Every click is the next
 * action; the control that comes next carries a ring, so the presenter can
 * click it with the mouse or just use the clicker.
 */
export function AdminScene({ phase, step, revealMode }: SceneProps) {
  const beat = useBeat(phase, step, revealMode, [1200, 3800, 6400, 8000, 11400, 14200, 19200]);

  // Voice input: the request appears word by word.
  const words = CLARIFY_REQUEST.split(" ");
  const [heard, setHeard] = useState(0);
  useEffect(() => {
    if (phase !== "enter" || beat !== B.clarify) return;
    const timer = window.setInterval(() => setHeard((n) => Math.min(n + 1, words.length)), 120);
    return () => window.clearInterval(timer);
  }, [phase, beat, words.length]);
  const heardWords = beat > B.clarify ? words.length : beat === B.clarify ? heard : 0;

  // After "Send", the site manager's answer arrives and the gaps close.
  const [answeredAt, setAnsweredAt] = useState(0);
  useEffect(() => {
    if (phase !== "enter" || beat !== B.send) return;
    const timer = window.setTimeout(() => setAnsweredAt(B.send), UPDATE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, beat]);
  const complete = beat >= B.validate || (beat === B.send && answeredAt === B.send);

  const status: DocStatus = beat >= B.validate ? "validated" : complete ? "ready" : "open";
  const opened = beat >= B.open;
  const composer = beat >= B.clarify && beat < B.send;
  const next = (b: number) => (beat === b - 1 ? NEXT_ACTION : "");

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
                    <Button variant="outline" className={next(B.transcript)}>
                      View transcript
                    </Button>
                    <Button variant="outline" className={next(B.clarify)}>
                      <Mic aria-hidden /> Clarify
                    </Button>
                    <Button
                      aria-disabled={!complete || undefined}
                      className={cn(!complete && "opacity-50", complete && next(B.validate))}
                    >
                      {status === "validated" ? (
                        <>
                          <Check aria-hidden /> Validated
                        </>
                      ) : (
                        "Validate"
                      )}
                    </Button>
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

                {/* Clarify composer */}
                <AnimatePresence>
                  {composer && (
                    <motion.section
                      key="composer"
                      aria-label="Clarify"
                      className="absolute inset-x-5 bottom-5 flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 24 }}
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
                          <Button size="lg" className={next(B.send)}>Send</Button>
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
              <StatusLine status={status} />

              {/* The loop, in the panel: sent → the site manager's reply */}
              <AnimatePresence mode="popLayout" initial={false}>
                {beat === B.send && !complete && (
                  <motion.p
                    key="sent"
                    role="status"
                    className="flex items-start gap-2 rounded-lg border border-zinc-200 p-3 text-sm leading-snug text-zinc-800"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={ease}
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.5} aria-hidden />
                    Sent to site manager · Klara will ask him in his language.
                  </motion.p>
                )}
                {complete && (
                  <motion.div
                    key="reply"
                    role="status"
                    className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3"
                    initial={{ opacity: 0, y: -6 }}
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
                <h4 className="flex items-center gap-1.5 text-xs text-zinc-500"><CircleCheck className="size-3.5" aria-hidden /> Present</h4>
                {PRESENT.map((p) => (
                  <CheckRow key={p} ok label={p} />
                ))}
                {complete && MISSING.map((m) => <CheckRow key={m.label} ok label={m.label} detail={m.added} fresh />)}
              </section>

              <section className="flex flex-col gap-2">
                <h4 className="flex items-center gap-1.5 text-xs text-zinc-500"><AlertCircle className="size-3.5" aria-hidden /> Missing</h4>
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
                      <Button variant="ghost" size="icon-lg" aria-label="Close transcript" className={next(B.closeTranscript)}>
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
      </div>
    </LightScene>
  );
}

function StatusLine({ status }: { status: DocStatus }) {
  const text =
    status === "validated"
      ? "Validiert"
      : status === "ready"
        ? "Complete · ready to validate"
        : "2 missing · expected duration, photo";
  const green = status === "ready" || status === "validated";
  return (
    <motion.p
      key={status}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={ease}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
        green ? "border-green-200 bg-green-50 text-light-green-text" : "border-amber-200 bg-amber-50 text-light-yellow-text",
      )}
    >
      {status === "validated" ? (
        <Check className="size-4" strokeWidth={2.5} aria-hidden />
      ) : (
        <span aria-hidden className={cn("size-2.5 rounded-full", green ? "bg-light-green" : "bg-light-yellow")} />
      )}
      {text}
    </motion.p>
  );
}

function CheckRow({ ok = false, label, detail, fresh = false }: { ok?: boolean; label: string; detail?: string; fresh?: boolean }) {
  return (
    <motion.p
      className="flex items-start gap-2 text-sm leading-snug"
      initial={fresh ? { opacity: 0, x: -6 } : false}
      animate={{ opacity: 1, x: 0 }}
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
