"use client";

import { motion } from "motion/react";
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { KPIS, TEAM_ROWS, TRADE_PROGRESS } from "../pitch-story";
import { EASE_OUT, u } from "../stage";
import { PAPER_SHADOW } from "./CaseDocument";
import { LightScene, PitchHeadline, useBeat, type SceneProps } from "./scene-parts";

const chartConfig = {
  plan: { label: "Plan", color: "#d4d4d8" },
  actual: { label: "Actual", color: "#3f3f46" },
} satisfies ChartConfig;

const PANEL = "absolute flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white";

/** Scene 5 – portfolio. Step 1 points at the problem. */
export function PortfolioScene({ phase, step, revealMode }: SceneProps) {
  const beat = useBeat(phase, step, revealMode, [2600]);
  const focus = beat >= 1;

  return (
    <LightScene label="Scene 5 – portfolio" phase={phase}>
      <PitchHeadline>See every site at a glance.</PitchHeadline>

      <dl className="absolute grid grid-cols-4" style={{ left: u(160), top: u(214), width: u(1600), gap: u(24) }}>
        {KPIS.map((k) => (
          <div key={k.label} className={cn("flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white px-5 py-4", PAPER_SHADOW)}>
            <dt className="text-sm text-zinc-500">{k.label}</dt>
            <dd className="font-mono font-semibold tracking-[-0.03em] text-zinc-900" style={{ fontSize: u(56), lineHeight: 1.05 }}>
              {k.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Plan vs actual by trade */}
      <section className={cn(PANEL, PAPER_SHADOW, "p-5")} style={{ left: u(160), top: u(400), width: u(760), height: u(530) }}>
        <div className="flex items-baseline justify-between">
          <h3 className="text-base font-semibold">Plan vs. actual by trade</h3>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-zinc-300" />Plan</span>
            <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-zinc-700" />Actual</span>
            <span>% complete</span>
          </div>
        </div>
        <ChartContainer config={chartConfig} className="mt-2 aspect-auto min-h-0 w-full flex-1 text-sm">
          <BarChart data={[...TRADE_PROGRESS]} layout="vertical" margin={{ left: 0, right: 48, top: 4, bottom: 4 }} barCategoryGap="22%" barGap={4}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="trade" tickLine={false} axisLine={false} width={120} />
            <Bar dataKey="plan" fill="var(--color-plan)" radius={4} isAnimationActive={false}>
              <LabelList dataKey="plan" position="right" className="fill-zinc-500 font-mono" />
            </Bar>
            <Bar dataKey="actual" radius={4} isAnimationActive={false}>
              {TRADE_PROGRESS.map((t) => (
                <Cell key={t.trade} fill={t.highlight && focus ? "var(--light-yellow)" : "var(--color-actual)"} />
              ))}
              <LabelList dataKey="actual" position="right" className="fill-zinc-900 font-mono" />
            </Bar>
          </BarChart>
        </ChartContainer>
      </section>

      {/* Per site and team */}
      <section className={cn(PANEL, PAPER_SHADOW)} style={{ left: u(950), top: u(400), width: u(810), height: u(530) }}>
        <h3 className="px-5 pt-5 pb-2 text-base font-semibold">Sites and teams</h3>
        <Table className="text-sm [&_td]:py-1.5">
          <TableHeader>
            <TableRow className="hover:bg-transparent [&>th]:h-auto [&>th]:py-2">
              <TableHead className="pl-5 text-zinc-500">Site</TableHead>
              <TableHead className="text-zinc-500">Team</TableHead>
              <TableHead className="w-[5.5em] text-right leading-tight whitespace-normal text-zinc-500">Open cases</TableHead>
              <TableHead className="w-[6em] text-right leading-tight whitespace-normal text-zinc-500">Missing reports</TableHead>
              <TableHead className="w-[5.5em] pr-5 text-right leading-tight whitespace-normal text-zinc-500">Delay days</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {TEAM_ROWS.map((r) => {
              const hot = "highlight" in r && r.highlight && focus;
              return (
                <TableRow key={`${r.site}-${r.team}`} className={cn("hover:bg-transparent", hot && "bg-amber-50 hover:bg-amber-50")}>
                  <TableCell className={cn("pl-5 text-zinc-500", hot && "shadow-[inset_3px_0_0_var(--light-yellow)]")}>
                    <span className="font-mono">{r.site}</span> {r.siteName}
                  </TableCell>
                  <TableCell className="font-medium text-zinc-900">{r.team}</TableCell>
                  <Num value={r.open} />
                  <Num value={r.missing} />
                  <Num value={r.delay} className={cn("pr-5", hot && "font-semibold text-light-yellow-text")} />
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <motion.p
        role="status"
        className="absolute flex items-center font-medium text-zinc-900"
        style={{ left: u(160), top: u(962), gap: u(14), fontSize: u(28) }}
        initial={{ opacity: 0, y: 8 }}
        animate={focus ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
      >
        <span aria-hidden className="rounded-full bg-light-yellow" style={{ width: u(14), height: u(14) }} />
        Elektro, Baustelle B: 3 days behind — <span lang="de">Behinderung angezeigt</span>
      </motion.p>
    </LightScene>
  );
}

function Num({ value, className }: { value: number; className?: string }) {
  return <TableCell className={cn("text-right font-mono", value === 0 ? "text-zinc-500" : "text-zinc-900", className)}>{value}</TableCell>;
}
