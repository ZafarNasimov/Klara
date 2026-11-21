"use client";
// Dashboard widgets. Titles state the finding; values are labelled on the
// chart; status colours only for the traffic light (with a shape and a reason).
import Link from "next/link";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { Building2, ClipboardCheck, Mail, Phone, Users } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CellStatus, DashboardView, FeedSource, Kpi } from "@/lib/dashboard/compute";
import { fmtDayDe } from "@/lib/deadlines";
import { cn } from "@/lib/utils";

const EASE = [0.23, 1, 0.32, 1] as const;

/** Hover tooltip around one element (exact values). */
export function Tip({ content, children }: { content: ReactNode; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent className="max-w-sm">{content}</TooltipContent>
    </Tooltip>
  );
}

export function Card({ title, topic, children, className, action }: { title: string; topic: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-background", className)} aria-label={topic}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{topic}</p>
          <h2 className="mt-0.5 text-[15px] leading-snug font-semibold tracking-tight text-foreground">{title}</h2>
        </div>
        {action}
      </header>
      <div className="min-h-0 flex-1 px-5 pb-5">{children}</div>
    </section>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;

// ── KPI ─────────────────────────────────────────────────────────────────

const fmtValue = (v: number, format: Kpi["format"]) =>
  format === "eur" ? `${Math.round(v).toLocaleString("de-DE")} €` : Math.round(v).toLocaleString("de-DE");

function AnimatedNumber({ value, format }: { value: number; format: Kpi["format"] }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => fmtValue(v, format));
  const first = useRef(true);
  useEffect(() => {
    // Count up once on load (600 ms); later changes move from the old value.
    const c = animate(mv, value, { duration: reduce ? 0 : first.current ? 0.6 : 0.3, ease: EASE });
    first.current = false;
    return () => c.stop();
  }, [value, mv, reduce]);
  return <motion.span>{text}</motion.span>;
}

export function KpiCard({ kpi, index }: { kpi: Kpi; index: number }) {
  const reduce = useReducedMotion();
  // A changed value (realtime) flashes blue-50 once.
  const [prev, setPrev] = useState(kpi.value);
  const [flash, setFlash] = useState(0);
  if (kpi.value !== prev) {
    setPrev(kpi.value);
    setFlash((n) => n + 1);
  }
  return (
    <Tip content={<span>{kpi.basis}</span>}>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE, delay: index * 0.04 }}
        className="relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background px-4 pt-3.5 pb-3"
        data-kpi={kpi.key}
        data-changed={flash || undefined}
      >
        {flash ? (
          <motion.span
            key={flash}
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-blue-50"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.6, ease: "easeOut", delay: 0.2 }}
          />
        ) : null}
        <p className="relative flex items-baseline gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{kpi.label}</span>
          {kpi.note && kpi.key === "claims" ? <span className="rounded border border-border px-1 text-[10px]">{kpi.note}</span> : null}
        </p>
        <div className="relative mt-1.5 flex items-end justify-between gap-3">
          <p className="font-mono text-[28px] leading-none font-medium tracking-tight text-foreground tabular-nums">
            <AnimatedNumber value={kpi.value} format={kpi.format} />
          </p>
          <Sparkline values={kpi.spark} />
        </div>
        <p className="relative mt-2 truncate text-xs text-muted-foreground">
          {kpi.delta_label}
          {kpi.note && kpi.key !== "claims" ? <span className="text-foreground"> · {kpi.note}</span> : null}
        </p>
      </motion.div>
    </Tip>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 84;
  const h = 26;
  if (!values.length) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts.at(-1)!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke="var(--color-zinc-400)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.5} fill="var(--color-blue-600)" />
    </svg>
  );
}

// ── Heatmap ─────────────────────────────────────────────────────────────

const CELL: Record<CellStatus, string> = {
  green: "bg-light-green/12 text-light-green-text",
  amber: "bg-light-yellow/18 text-light-yellow-text",
  red: "bg-light-red text-white",
  none: "bg-zinc-50 text-zinc-300",
};
const SHAPE: Record<Exclude<CellStatus, "none">, string> = {
  green: "rounded-full bg-light-green",
  amber: "rotate-45 rounded-[1px] bg-light-yellow",
  red: "rounded-[1px] bg-white",
};

export function Heatmap({ v, linkable }: { v: DashboardView; linkable: boolean }) {
  const reduce = useReducedMotion();
  const { trades, rows } = v.heatmap;
  if (!rows.length) return <Empty>Keine Baustelle im Filter.</Empty>;
  return (
    <div role="table" aria-label="Baustelle × Gewerk" className="grid gap-1.5" style={{ gridTemplateColumns: `minmax(9.5rem,1.5fr) repeat(${trades.length}, minmax(0,1fr))` }}>
      <span role="columnheader" />
      {trades.map((t) => (
        <span key={t} role="columnheader" className="truncate pb-1 text-center text-xs text-muted-foreground">
          {t}
        </span>
      ))}
      {rows.map((r, ri) => (
        <motion.div
          key={r.project_id}
          role="row"
          className="contents"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.1 + ri * 0.03 }}
        >
          <motion.span role="rowheader" className="flex min-w-0 items-center gap-2 text-sm" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, delay: 0.1 + ri * 0.03 }}>
            <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
            <span className="text-[13px] leading-tight text-foreground">{r.name}</span>
          </motion.span>
          {r.cells.map((c) => {
            const body = (
              <span className={cn("flex h-11 items-center justify-center gap-1.5 rounded-md font-mono text-sm tabular-nums transition-colors duration-300", CELL[c.status])}>
                {c.status === "none" ? (
                  "–"
                ) : (
                  <>
                    <span aria-hidden className={cn("size-2", SHAPE[c.status])} />
                    {c.delay > 0 ? `+${c.delay}` : "0"}
                  </>
                )}
              </span>
            );
            const label = `${r.code} ${c.trade}: ${c.reason}`;
            return (
              <Tip key={c.trade} content={<span>{label}</span>}>
                {linkable && c.status !== "none" ? (
                  <motion.span initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, delay: 0.1 + ri * 0.03 }}>
                    <Link
                      href={`/admin/vorgaenge?site=${r.project_id}&trade=${encodeURIComponent(c.trade)}`}
                      aria-label={`${label}. Vorgänge anzeigen`}
                      data-cell={`${r.code}-${c.trade}`}
                      data-status={c.status}
                      className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {body}
                    </Link>
                  </motion.span>
                ) : (
                  <motion.span
                    role="cell"
                    aria-label={label}
                    data-cell={`${r.code}-${c.trade}`}
                    data-status={c.status}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.35, delay: 0.1 + ri * 0.03 }}
                  >
                    {body}
                  </motion.span>
                )}
              </Tip>
            );
          })}
        </motion.div>
      ))}
      <p className="col-span-full mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Legend shape={SHAPE.green} text="im Plan" />
        <Legend shape={SHAPE.amber} text="bis 2 Tage Verzug oder keine Meldung" />
        <Legend shape="rounded-[1px] bg-light-red" text="über 2 Tage oder offene Behinderung" />
        <span>Zahl = prognostizierte Verzugstage</span>
      </p>
    </div>
  );
}

const Legend = ({ shape, text }: { shape: string; text: string }) => (
  <span className="flex items-center gap-1.5">
    <span aria-hidden className={cn("size-2", shape)} />
    {text}
  </span>
);

// ── Plan vs. Ist (bullet) ───────────────────────────────────────────────

export function TradeBullets({ v }: { v: DashboardView }) {
  const reduce = useReducedMotion();
  const bars = v.trade_bars.bars;
  if (!bars.length) return <Empty>Für diesen Filter sind keine Mengen geplant.</Empty>;
  return (
    <ul className="flex flex-col gap-3.5">
      {bars.map((b, i) => (
        <li key={b.trade} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3">
          <span className={cn("truncate text-sm", b.worst ? "font-medium text-foreground" : "text-foreground")}>{b.trade}</span>
          <Tip content={<span>{`${b.trade}: Ist ${b.actual} % fertig, Soll bis gestern ${b.plan} % (${b.items} ${b.items === 1 ? "Vorgang" : "Vorgänge"} im Zeitraum)`}</span>}>
            <span className="relative block h-6" role="img" aria-label={`${b.trade}: Ist ${b.actual} Prozent, Soll ${b.plan} Prozent`}>
              <span className="absolute inset-y-1.5 left-0 w-full rounded-sm bg-zinc-100" />
              <motion.span
                className={cn("absolute inset-y-1.5 left-0 origin-left rounded-sm", b.worst ? "bg-blue-600" : "bg-zinc-400")}
                style={{ width: `${b.actual}%` }}
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.6, ease: EASE, delay: 0.15 + i * 0.04 }}
              />
              <span aria-hidden className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-zinc-900" style={{ left: `${b.plan}%` }} />
            </span>
          </Tip>
          <span className="text-right font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            <span className={b.worst ? "text-foreground" : ""}>{b.actual} %</span> / Soll {b.plan} %
          </span>
        </li>
      ))}
      <li className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-4 rounded-sm bg-zinc-400" /> Ist fertig
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-0.5 rounded-full bg-zinc-900" /> Soll bis gestern
        </span>
      </li>
    </ul>
  );
}

// ── Mini-Bauablauf ──────────────────────────────────────────────────────

const dayIndex = (d: string) => Math.round(Date.parse(`${d}T12:00:00Z`) / 86_400_000);

export function MiniSchedule({ v, linkable }: { v: DashboardView; linkable: boolean }) {
  const reduce = useReducedMotion();
  const s = v.schedule;
  if (!s.rows.length) return <Empty>Im Zeitraum sind auf dieser Baustelle keine Vorgänge geplant.</Empty>;
  const a = dayIndex(s.from);
  const span = dayIndex(s.to) - a + 1;
  const x = (d: string) => `${(Math.max(0, Math.min(span, dayIndex(d) - a)) / span) * 100}%`;
  const w = (from: string, to: string) => `${(Math.max(0, Math.min(span, dayIndex(to) - a + 1) - Math.max(0, dayIndex(from) - a)) / span) * 100}%`;
  const ticks: string[] = [];
  for (let i = 0; i < span; i++) {
    const d = new Date((a + i) * 86_400_000).toISOString().slice(0, 10);
    if (new Date(`${d}T12:00:00Z`).getUTCDay() === 1) ticks.push(d);
  }
  return (
    <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-x-3">
      <span />
      <div className="relative h-5 text-[11px] text-muted-foreground">
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 font-mono" style={{ left: x(t) }}>
            {fmtDayDe(t).slice(0, 6)}
          </span>
        ))}
      </div>
      {s.rows.map((r, i) => (
        <div key={r.id} className="contents">
          <Tip content={<span>{r.activity}</span>}>
            <span className="truncate py-2 text-sm text-foreground">
              {r.trade} <span className="text-muted-foreground">{r.area}</span>
            </span>
          </Tip>
          <div className="relative h-9 border-b border-zinc-100">
            {ticks.map((t) => (
              <span key={t} aria-hidden className="absolute inset-y-0 w-px bg-zinc-100" style={{ left: x(t) }} />
            ))}
            <Tip content={<span>{`Soll ${fmtDayDe(r.start)} – ${fmtDayDe(r.end)}`}</span>}>
              <motion.span
                className="absolute top-1.5 h-3 origin-left rounded-sm bg-zinc-200"
                style={{ left: x(r.start), width: w(r.start, r.end) }}
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.6, ease: EASE, delay: 0.1 + i * 0.04 }}
              />
            </Tip>
            <Tip content={<span>{`Prognose bis ${fmtDayDe(r.forecast_end)}${r.delay ? ` (+${r.delay} Arbeitstage${r.waits_for ? `, wartet auf ${r.waits_for}` : ""})` : ""}`}</span>}>
              <motion.span
                className="absolute top-5 h-2 origin-left rounded-sm bg-zinc-500"
                style={{ left: x(r.start), width: w(r.start, r.forecast_end) }}
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.6, ease: EASE, delay: 0.14 + i * 0.04 }}
              />
            </Tip>
            {r.delay > 0 ? (
              <span className="absolute top-[18px] pl-1.5 font-mono text-[11px] text-light-yellow-text" style={{ left: `calc(${x(r.start)} + ${w(r.start, r.forecast_end)})` }}>
                +{r.delay}
              </span>
            ) : null}
            {r.hindrances.map((h) => {
              const seg = (
                <span
                  className="absolute top-0.5 flex h-5 items-center overflow-visible rounded-sm bg-light-red px-1 text-[11px] font-medium whitespace-nowrap text-white"
                  style={{ left: x(h.start), width: w(h.start, h.end) }}
                >
                  {h.reference}
                </span>
              );
              return (
                <Tip key={h.case_id} content={<span>{`Behinderung ${h.reference} seit ${fmtDayDe(h.start)}`}</span>}>
                  {linkable ? (
                    <Link href={`/admin/case/${h.case_id}`} aria-label={`Behinderung ${h.reference} öffnen`}>
                      {seg}
                    </Link>
                  ) : (
                    seg
                  )}
                </Tip>
              );
            })}
            <span aria-hidden className="absolute -top-1 -bottom-px w-0.5 bg-blue-600" style={{ left: x(s.today) }} />
          </div>
        </div>
      ))}
      <span />
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-4 rounded-sm bg-zinc-200" /> Soll
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-4 rounded-sm bg-zinc-500" /> Prognose
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-4 rounded-sm bg-light-red" /> Behinderung
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-0.5 bg-blue-600" /> heute
        </span>
      </p>
    </div>
  );
}

// ── Berichtsvollständigkeit ─────────────────────────────────────────────

export function CompletenessGrid({ v }: { v: DashboardView }) {
  const reduce = useReducedMotion();
  const { rows, days } = v.completeness;
  if (!rows.length) return <Empty>Keine Teams mit geplanter Arbeit im Zeitraum.</Empty>;
  const small = days.length > 14;
  return (
    <div className="overflow-x-auto">
      <div className="grid items-center gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: "9rem minmax(0,1fr)" }}>
        {rows.map((r, ri) => (
          <motion.div key={r.team_id} className="contents" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 + ri * 0.03 }}>
            <span className="truncate text-sm text-foreground">
              <span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.team.replace(/^Team\s+/, "")}
            </span>
            <span className="flex gap-1">
              {r.cells.map((c) => (
                <Tip key={c.day} content={<span>{`${r.code} ${r.team}, ${fmtDayDe(c.day)}: ${c.state === "report" ? "Bericht eingegangen" : c.state === "missing" ? "Bericht fehlt" : "keine Arbeit geplant"}`}</span>}>
                  <span
                    role="img"
                    aria-label={`${fmtDayDe(c.day)}: ${c.state === "report" ? "Bericht" : c.state === "missing" ? "fehlt" : "frei"}`}
                    className={cn(
                      "shrink-0 rounded-[3px]",
                      small ? "size-3" : "size-4",
                      c.state === "report" ? "bg-zinc-700" : c.state === "missing" ? "border-2 border-light-red bg-background" : "bg-zinc-100",
                      c.day === v.today && "ring-1 ring-blue-600 ring-offset-1",
                    )}
                  />
                </Tip>
              ))}
            </span>
          </motion.div>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-[3px] bg-zinc-700" /> Bericht
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-[3px] border-2 border-light-red" /> fehlt
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-[3px] bg-zinc-100" /> keine Arbeit
        </span>
        <span>
          {fmtDayDe(days[0]).slice(0, 6)} – heute
        </span>
      </p>
    </div>
  );
}

// ── Dokumenten-Pipeline ─────────────────────────────────────────────────

const PIPE_TONE = ["bg-zinc-200", "bg-zinc-300", "bg-zinc-400", "bg-zinc-600", "bg-zinc-800"];

export function Pipeline({ v }: { v: DashboardView }) {
  const reduce = useReducedMotion();
  const steps = v.pipeline.steps;
  const total = steps.reduce((s, x) => s + x.count, 0);
  if (!total) return <Empty>Noch keine Schreiben in diesem Filter.</Empty>;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-sm bg-zinc-100" role="img" aria-label={steps.map((s) => `${s.label} ${s.count}`).join(", ")}>
        {steps.map((s, i) =>
          s.count ? (
            <motion.span
              key={s.status}
              className={cn("h-full origin-left border-r-2 border-background last:border-r-0", PIPE_TONE[i])}
              style={{ width: `${(s.count / total) * 100}%` }}
              initial={reduce ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.15 + i * 0.04 }}
            />
          ) : null,
        )}
      </div>
      <ol lang="de" className="mt-4 grid grid-cols-5 gap-x-2 hyphens-auto">
        {steps.map((s, i) => (
          <li key={s.status} className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-[2px]", PIPE_TONE[i])} />
              <span className="min-w-0 leading-tight break-words">{s.label}</span>
            </p>
            <p className="mt-1 font-mono text-xl font-medium text-foreground tabular-nums">{s.count}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Aktivitäten ─────────────────────────────────────────────────────────

const SOURCE: Record<FeedSource, { icon: typeof Phone; label: string }> = {
  call: { icon: Phone, label: "Telefonat" },
  meeting: { icon: Users, label: "Meeting" },
  email: { icon: Mail, label: "E-Mail" },
  checkin: { icon: ClipboardCheck, label: "Check-in" },
  system: { icon: Building2, label: "Büro" },
};

const timeFmt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" });
const dayKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });

export function ActivityFeed({ v, linkable }: { v: DashboardView; linkable: boolean }) {
  if (!v.feed.length) return <Empty>Im Zeitraum ist nichts passiert.</Empty>;
  return (
    <ol className="-mx-2 flex flex-col">
      {v.feed.map((f) => {
        const S = SOURCE[f.source];
        const at = new Date(f.at);
        const when = dayKey.format(at) === v.today ? timeFmt.format(at) : dateFmt.format(at);
        const body = (
          <span className="flex gap-3 rounded-lg px-2 py-2.5">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground" title={S.label}>
              <S.icon className="size-3.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">{f.title}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{when}</span>
              </span>
              {f.detail ? <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{f.detail}</span> : null}
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {S.label}
                {f.code ? ` · Baustelle ${f.code}` : " · mehrere Baustellen"}
              </span>
            </span>
          </span>
        );
        return (
          <li key={f.id}>
            {linkable && f.href ? (
              <Link href={f.href} className="block rounded-lg outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}
