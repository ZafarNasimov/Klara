"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { DOC_COMPLETION, DOC_FIELDS, DOC_REFERENCE, DOC_TITLE, todayDE, type DocField } from "../pitch-story";

export type DocStatus = "building" | "processing" | "open" | "ready" | "validated";

const STATUS: Record<DocStatus, { text: string; dot: string; tone: string }> = {
  building: { text: "Entwurf · wird erstellt", dot: "bg-zinc-300", tone: "text-zinc-600 border-zinc-200 bg-white" },
  // Between the foreman's sentence and the fields it fills.
  processing: { text: "Klara verarbeitet die Aussage …", dot: "bg-primary", tone: "text-primary border-blue-200 bg-blue-50" },
  open: { text: "Entwurf · 2 Angaben offen", dot: "bg-light-yellow", tone: "text-light-yellow-text border-amber-200 bg-amber-50" },
  ready: { text: "Vollständig · bereit zur Validierung", dot: "bg-light-green", tone: "text-light-green-text border-green-200 bg-green-50" },
  validated: { text: "Validiert", dot: "", tone: "text-light-green-text border-green-200 bg-green-50" },
};

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

  return (
    <article
      lang="de"
      aria-label={DOC_TITLE}
      className={cn("flex flex-col rounded-md border border-zinc-200 bg-white px-8 py-6", PAPER_SHADOW, className)}
    >
      <header className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-4">
        <div className="min-w-0">
          <p className="text-xs text-zinc-500">
            Muster Bau GmbH · <span className="font-mono">{DOC_REFERENCE}</span>
          </p>
          <h3 className="mt-1 text-base leading-snug font-semibold text-balance text-zinc-900">{DOC_TITLE}</h3>
        </div>
        <motion.span
          key={status}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className={cn("mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", s.tone)}
        >
          {status === "validated" ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> : <span aria-hidden className={cn("size-2 rounded-full", s.dot)} />}
          {s.text}
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
      <dd className="min-h-[1.5em] text-sm leading-snug">
        {state === "filled" && (
          <motion.span
            key={value}
            className={cn("-mx-1 inline rounded-sm px-1 text-zinc-900", field.mono && "font-mono")}
            // A field that just filled flashes once in the accent, then settles.
            initial={{ opacity: 0, backgroundColor: "rgb(37 99 235 / 0.14)" }}
            animate={{ opacity: 1, backgroundColor: "rgb(37 99 235 / 0)" }}
            transition={{ opacity: { duration: 0.25 }, backgroundColor: { duration: 1.2, delay: 0.3 } }}
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
