"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { cn } from "@/lib/utils";
import { CALL_CAPABILITIES, CALL_EXCHANGES, CALL_SCRIPT, type CallLine } from "../pitch-story";
import { EASE_IN_OUT, EASE_OUT, u } from "../stage";
import { CaseDocument } from "./CaseDocument";
import { LightScene, useBeat, type SceneProps } from "./scene-parts";

/**
 * Per exchange, after the foreman's line appears (the click):
 * Klara "processes" → the fields from that sentence fill → Klara answers.
 * Fields her own line mentions (the open flags) follow shortly after it.
 */
const FILL_DELAY_MS = 1400;
const ANSWER_DELAY_MS = 2200;
const KLARA_FILL_DELAY_MS = ANSWER_DELAY_MS + 400;

/** Within the current exchange: 0 foreman spoke, 1 fields filled, 2 Klara answered, 3 her fields filled. */
type Stage = 0 | 1 | 2 | 3;
/** Document box (design px); after the call it slides to the left column. */
const DOC = { left: 980, top: 150, width: 780 };
const DOC_SHIFT = `${-((DOC.left - 160) / DOC.width) * 100}%`;

/**
 * Scene 2 – the call (REPLAY). Steps 1–4: one exchange each. The foreman's
 * line appears on the click; after a processing pause the document fields
 * from it fill, then Klara answers. Step 5: the chat leaves, the document
 * moves left, the capabilities arrive.
 */
export function CallScene({ phase, step, revealMode }: SceneProps) {
  const beat = useBeat(phase, step, revealMode, [700, 6500, 11500, 17000, 23500]);
  const exchanges = Math.min(beat, CALL_EXCHANGES);
  const after = beat > CALL_EXCHANGES;

  // Progress inside the newest exchange; earlier exchanges are complete.
  const [progress, setProgress] = useState<{ exchange: number; stage: Stage }>({ exchange: 0, stage: 0 });
  useEffect(() => {
    if (phase !== "enter" || exchanges === 0) return;
    const set = (stage: Stage) => () => setProgress({ exchange: exchanges, stage });
    const timers = [
      window.setTimeout(set(1), FILL_DELAY_MS),
      window.setTimeout(set(2), ANSWER_DELAY_MS),
      window.setTimeout(set(3), KLARA_FILL_DELAY_MS),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [phase, exchanges]);

  const stage: Stage = after ? 3 : progress.exchange === exchanges ? progress.stage : 0;
  const foremanLine = (exchanges - 1) * 2; // index of the newest foreman line
  // Lines on screen, and the last line whose facts are in the document.
  const shown = after ? CALL_SCRIPT.length : exchanges === 0 ? 0 : foremanLine + (stage >= 2 ? 2 : 1);
  const heardUpTo = after ? CALL_SCRIPT.length - 1 : exchanges === 0 ? -1 : foremanLine - 1 + (stage >= 3 ? 2 : stage >= 1 ? 1 : 0);
  const processing = !after && exchanges > 0 && stage === 0;
  const thinking = !after && exchanges > 0 && stage === 1;
  const done = heardUpTo >= CALL_SCRIPT.length - 1;

  return (
    <LightScene label="Scene 2 – the call" phase={phase}>
      <div className="absolute flex items-center gap-4" style={{ left: u(160), top: u(72) }}>
        <Badge variant="outline" className="h-auto border-zinc-300 bg-white px-3 py-1 font-mono text-sm text-zinc-900">
          EN → DE
        </Badge>
        <span className="text-sm text-zinc-500">Team Estrich · Wohnanlage Riem</span>
      </div>

      {/* Chat transcript (left) */}
      <motion.div
        aria-label="Call transcript"
        className="absolute flex flex-col justify-end gap-4 overflow-hidden mask-[linear-gradient(to_bottom,transparent,#000_12%)]"
        style={{ left: u(160), top: u(150), width: u(720), bottom: u(80) }}
        initial={false}
        animate={after ? { opacity: 0, filter: "blur(6px)" } : { opacity: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.25, ease: EASE_OUT }}
      >
        {CALL_SCRIPT.slice(0, shown).map((line, i) => (
          <Message key={i} line={line} />
        ))}
        {thinking && <Thinking />}
      </motion.div>

      {/* German document (right, then left) */}
      <motion.div
        className="absolute"
        style={{ left: u(DOC.left), top: u(DOC.top), width: u(DOC.width) }}
        initial={false}
        animate={{ x: after ? DOC_SHIFT : "0%" }}
        transition={{ duration: 0.7, ease: EASE_IN_OUT, delay: after ? 0.15 : 0 }}
      >
        <CaseDocument heardUpTo={heardUpTo} status={done ? "open" : processing ? "processing" : "building"} />
      </motion.div>

      {/* After the call: what just happened, one by one */}
      {after && (
        <ul className="absolute flex flex-col" style={{ left: u(1040), top: u(250), width: u(720), gap: u(34) }}>
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
              <span className="tracking-[-0.01em] text-pretty">{text}</span>
            </motion.li>
          ))}
        </ul>
      )}
    </LightScene>
  );
}

/** Klara is composing her answer (shown between the fields filling and her reply). */
function Thinking() {
  return (
    <motion.div
      className="flex shrink-0 items-end gap-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
    >
      <KlaraAvatar size={36} className="size-9 self-start" title="Klara" />
      <p aria-label="Klara is answering" className="rounded-2xl rounded-tl-md border border-zinc-200 bg-white px-4 py-2.5 text-sm leading-snug text-zinc-400">
        …
      </p>
    </motion.div>
  );
}

function Message({ line }: { line: CallLine }) {
  const klara = line.who === "klara";
  return (
    <motion.div
      className={cn("flex shrink-0 items-end gap-3", klara ? "justify-start" : "flex-col items-end gap-1.5")}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
    >
      {klara ? (
        <>
          <KlaraAvatar size={36} className="size-9 self-start" title="Klara" />
          <p className="max-w-[88%] rounded-2xl rounded-tl-md border border-zinc-200 bg-white px-4 py-2.5 text-sm leading-snug text-zinc-900">
            {line.text}
          </p>
        </>
      ) : (
        <>
          <span className="flex items-center gap-2 text-xs text-zinc-500">
            Polier
            <span className="rounded-sm border border-zinc-300 bg-white px-1.5 font-mono text-[0.85em] text-zinc-700">EN</span>
          </span>
          <p lang="en" className="max-w-[88%] rounded-2xl rounded-br-md bg-zinc-100 px-4 py-2.5 text-sm leading-snug text-zinc-900">
            {line.text}
          </p>
        </>
      )}
    </motion.div>
  );
}
