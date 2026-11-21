"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { DOC_COMPLETION, DOC_FIELDS, DOC_REFERENCE, DOC_TITLE, todayDE, type DocField } from "../pitch-story";

export type DocStatus = "building" | "processing" | "open" | "ready" | "validated";

/** Status tones as values, so a change can crossfade (traffic light: DESIGN.md). */
export const STATUS_COLORS = {
  neutral: { bg: "#ffffff", border: "#e4e4e7", text: "#52525b", dot: "#d4d4d8" },
  blue: { bg: "#eff6ff", border: "#bfdbfe", text: "#2563eb", dot: "#2563eb" },
  amber: { bg: "#fffbeb", border: "#fde68a", text: "#b45309", dot: "#d97706" },
  green: { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", dot: "#16a34a" },
} as const;

const STATUS: Record<DocStatus, { text: string; tone: keyof typeof STATUS_COLORS }> = {
  building: { text: "Entwurf · wird erstellt", tone: "neutral" },
  // Between the foreman's sentence and the fields it fills.
  processing: { text: "Klara verarbeitet die Aussage …", tone: "blue" },
  open: { text: "Entwurf · 2 Angaben offen", tone: "amber" },
  ready: { text: "Vollständig · bereit zur Validierung", tone: "green" },
  validated: { text: "Validiert", tone: "green" },
};

const crossfade = { duration: 0.3, ease: "easeInOut" } as const;

/** One elevation for paper across the pitch. */
export const PAPER_SHADOW = "shadow-[0_1px_2px_rgb(0_0_0/0.05),0_12px_32px_-16px_rgb(0_0_0/0.18)]";

/**
 * The German Behinderungsanzeige from the story. Fields fill as the call
 * mentions them (`heardUpTo` = last script line heard); the two open ones turn
 * amber with their reason once Klara flags them; `complete` fills them in.
 */
export function CaseDocument({
  heardUpTo,
  complete = false,
  status,
  className,
}: {
  heardUpTo: number;
  complete?: boolean;
  status: DocStatus;
  className?: string;
}) {
  // Fixed for the session, so the date never changes mid-pitch.
  const [today] = useState(todayDE);
  const s = STATUS[status];
  const c = STATUS_COLORS[s.tone];
  const title = status === "validated" ? DOC_TITLE.replace(/\s*\(Entwurf\)$/, "") : DOC_TITLE;

  return (
    <article
      lang="de"
      aria-label={title}
      className={cn("flex flex-col rounded-md border border-zinc-200 bg-white px-8 py-6", PAPER_SHADOW, className)}
    >
      <header className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-4">
        <div className="min-w-0">
          <p className="text-xs text-zinc-500">
            Muster Bau GmbH · <span className="font-mono">{DOC_REFERENCE}</span>
          </p>
          <h3 className="mt-1 text-base leading-snug font-semibold text-balance text-zinc-900">{title}</h3>
        </div>
        <motion.span
          className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
          initial={false}
          animate={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}
          transition={crossfade}
        >
          {status === "validated" ? (
            <DrawnCheck />
          ) : (
            <motion.span aria-hidden className="size-2 rounded-full" initial={false} animate={{ backgroundColor: c.dot }} transition={crossfade} />
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={s.text} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {s.text}
            </motion.span>
          </AnimatePresence>
        </motion.span>
      </header>

      <dl className="mt-1 flex flex-col">
        {DOC_FIELDS.map((field) => (
          <FieldRow key={field.key} field={field} heardUpTo={heardUpTo} complete={complete} today={today} />
        ))}
      </dl>
    </article>
  );
}

function FieldRow({ field, heardUpTo, complete, today }: { field: DocField; heardUpTo: number; complete: boolean; today: string }) {
  const heard = field.filledAt <= heardUpTo;
  const completed = complete ? DOC_COMPLETION[field.key] : undefined;
  const value = completed ?? (heard ? field.value(today) : null);
  const open = !value && heard && field.openLabel;
  const state = value ? "filled" : open ? "open" : "empty";

  return (
    <div className="grid grid-cols-[38%_1fr] gap-4 border-b border-zinc-100 py-2 last:border-0">
      <dt className="text-xs leading-relaxed text-zinc-500">{field.label}</dt>
      <dd className="min-h-[1.5em] text-sm leading-snug text-pretty">
        {state === "filled" && (
          <motion.span
            key={value}
            className={cn("-mx-1 inline rounded-sm px-1 text-zinc-900", field.mono && "font-mono")}
            // A field that just filled fades in (400 ms) on a short blue-50 highlight.
            initial={{ opacity: 0, backgroundColor: "rgb(239 246 255 / 1)" }}
            animate={{ opacity: 1, backgroundColor: "rgb(239 246 255 / 0)" }}
            transition={{ opacity: { duration: 0.4 }, backgroundColor: { duration: 0.9, delay: 0.4 } }}
          >
            {value}
          </motion.span>
        )}
        {state === "open" && (
          <motion.span
            className="inline-flex items-center gap-1.5 font-medium text-light-yellow-text"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <span aria-hidden className="size-2 rounded-full bg-light-yellow" />
            {field.openLabel}
          </motion.span>
        )}
        {state === "empty" && <span aria-hidden className="mt-1.5 block h-2.5 w-2/5 rounded-full bg-zinc-100" />}
      </dd>
    </div>
  );
}

/** "Validiert": the check draws itself once (400 ms). */
function DrawnCheck() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease: "easeOut" }} />
    </svg>
  );
}
