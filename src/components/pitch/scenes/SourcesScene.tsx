"use client";

import { ArrowDown, CalendarDays, Mail, Sunrise, Sunset } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { cn } from "@/lib/utils";
import { EASE_OUT, u } from "../stage";
import { PAPER_SHADOW } from "./CaseDocument";
import { LightScene, PitchHeadline, useBeat, type SceneProps } from "./scene-parts";

const CARD = { top: 290, width: 500, height: 650, lefts: [160, 710, 1260] };

/** Scene 4 – more sources. Three cards, one per click. */
export function SourcesScene({ phase, step, revealMode }: SceneProps) {
  const beat = useBeat(phase, step, revealMode, [900, 2400, 3900]);

  return (
    <LightScene label="Scene 4 – more sources" phase={phase}>
      <PitchHeadline>Calls. Meetings. Emails. One reporting system.</PitchHeadline>

      <SourceCard index={0} show={beat >= 1} title="Meeting summaries" result="1 verbal client order detected → written confirmation drafted">
        <MiniHeader icon={<CalendarDays aria-hidden />} title="Baubesprechung, 19.11." meta="Protokoll" />
        <p className="text-xs text-zinc-500">3 Beschlüsse · 4 Aufgaben</p>
        <ul className="flex flex-col divide-y divide-zinc-100 text-xs">
          {[
            ["Freigabe 2. OG melden", "Elektro (AG)", "22.11."],
            ["Angebot Brandschutztüren", "Bauleitung", "25.11."],
            ["Bautagesberichte KW 47", "Polier Ausbau", "21.11."],
            ["Fotodoku Fassade", "Polier Rohbau", "24.11."],
          ].map(([task, owner, due]) => (
            <li key={task} className="grid grid-cols-[1fr_auto] gap-x-3 py-1.5">
              <span className="text-zinc-900">{task}</span>
              <span className="font-mono text-zinc-500">{due}</span>
              <span className="col-span-2 text-zinc-500">{owner}</span>
            </li>
          ))}
        </ul>
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs leading-snug text-light-yellow-text">
          Mündliche Anordnung Bauherr: zusätzliche Steckdosen Haus 2
        </p>
      </SourceCard>

      <SourceCard index={1} show={beat >= 2} title="Email integration" result="1 extra-work request detected → Mehrkostenanzeige drafted">
        <MiniHeader icon={<Mail aria-hidden />} title="Lehner Architekten" meta="09:14" />
        <div className="flex flex-col gap-1 text-xs">
          <p className="text-zinc-500">Betreff: Brandschutz 3. OG</p>
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm leading-snug text-zinc-900">
            „Bitte im 3. OG zusätzliche Brandschutztüren vorsehen.“
          </p>
        </div>
        <ArrowDown className="mx-auto size-5 text-zinc-300" aria-hidden />
        <div className="flex items-start gap-2 rounded-md border border-zinc-200 px-3 py-2">
          <KlaraAvatar size={24} className="size-6 shrink-0" />
          <p className="text-xs leading-snug text-zinc-800">
            Zusatzleistung, nicht im Leistungsverzeichnis. Vor Ausführung anzeigen (§ 2 Abs. 6 VOB/B).
          </p>
        </div>
      </SourceCard>

      <SourceCard index={2} show={beat >= 3} title="Daily plans & reports" result="1 delay detected → +2 days forecast, flooring team informed">
        <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3">
          <p className="flex items-center gap-2 text-xs text-zinc-500">
            <Sunrise className="size-4" aria-hidden /> Morgens <span className="font-mono">07:00</span>
          </p>
          <p className="text-sm text-zinc-900">Plan heute: Estrich 2. OG, 40 m²</p>
          <span className="self-start rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white">Alles nach Plan</span>
        </div>
        <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3">
          <p className="flex items-center gap-2 text-xs text-zinc-500">
            <Sunset className="size-4" aria-hidden /> Abends <span className="font-mono">17:00</span>
          </p>
          <p className="text-sm text-zinc-900">
            Ist: <span className="font-mono">15 m²</span> <span className="text-light-yellow-text">(38 % vom Plan)</span>
          </p>
          <div className="relative h-2 overflow-hidden rounded-full bg-zinc-100" role="img" aria-label="38 % vom Plan">
            <motion.div
              className="h-full rounded-full bg-light-yellow"
              initial={{ width: "0%" }}
              animate={{ width: beat >= 3 ? "38%" : "0%" }}
              transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.4 }}
            />
          </div>
        </div>
      </SourceCard>
    </LightScene>
  );
}

function SourceCard({
  index,
  show,
  title,
  result,
  children,
}: {
  index: number;
  show: boolean;
  title: string;
  result: string;
  children: ReactNode;
}) {
  return (
    <motion.article
      className={cn("absolute flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white", PAPER_SHADOW)}
      style={{ left: u(CARD.lefts[index]), top: u(CARD.top), width: u(CARD.width), height: u(CARD.height) }}
      initial={{ opacity: 0, y: 16 }}
      animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <h3 className="font-semibold tracking-[-0.02em] text-zinc-900" style={{ fontSize: u(30), padding: `${u(26)} ${u(28)} ${u(18)}` }}>
        {title}
      </h3>
      <div lang="de" className="flex min-h-0 flex-1 flex-col gap-3 px-5">
        {children}
      </div>
      <p className="mt-auto border-t border-zinc-100 bg-zinc-50 text-pretty text-zinc-900" style={{ fontSize: u(22), lineHeight: 1.35, padding: `${u(18)} ${u(28)}` }}>
        {result}
      </p>
    </motion.article>
  );
}

function MiniHeader({ icon, title, meta }: { icon: ReactNode; title: string; meta: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-zinc-100 pb-2 [&_svg]:size-4 [&_svg]:text-zinc-400">
      {icon}
      <span className="text-sm font-medium text-zinc-900">{title}</span>
      <span className="ml-auto font-mono text-xs text-zinc-500">{meta}</span>
    </div>
  );
}
