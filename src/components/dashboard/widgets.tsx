"use client";
// Dashboard widgets. Short titles; insights live in "Handlungsbedarf"; exact
// values in tooltips. Status colours only for the traffic light, always with
// a shape (● ◆ ■) and a reason.
import Link from "next/link";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { ArrowDown, ArrowUp, Building2, ChevronRight, ClipboardCheck, Info, Mail, Phone, Users } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CellStatus, DashboardView, FeedSource, Kpi } from "@/lib/dashboard/compute";
import { fmtDayDe } from "@/lib/deadlines";
import { cn } from "@/lib/utils";
import { DISTRICTS, ISAR, MAP_H, MAP_W, OUTLINE, project } from "./munich-map";

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

export function InfoTip({ text, label }: { text: ReactNode; label: string }) {
  return (
    <Tip content={<span>{text}</span>}>
      <button type="button" aria-label={label} className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <Info className="size-3.5" aria-hidden />
      </button>
    </Tip>
  );
}

/** A card with a one-line title (max five words). */
export function Card({ title, children, className, action }: { title: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-background", className)} aria-label={title}>
      <header className="flex h-12 items-center justify-between gap-3 px-5">
        <h2 className="text-sm font-semibold whitespace-nowrap text-foreground">{title}</h2>
        {action}
      </header>
      <div className="min-h-0 flex-1 px-5 pb-5">{children}</div>
    </section>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;

/** ● im Plan, ◆ bis 2 Tage, ■ über 2 Tage / Behinderung. */
const SHAPE: Record<Exclude<CellStatus, "none">, string> = {
  green: "rounded-full bg-light-green",
  amber: "rotate-45 rounded-[1px] bg-light-yellow",
  red: "rounded-[1px] bg-light-red",
};
const Shape = ({ status, className }: { status: Exclude<CellStatus, "none">; className?: string }) => (
  <span aria-hidden className={cn("inline-block size-2 shrink-0", SHAPE[status], className)} />
);

// ── KPI ─────────────────────────────────────────────────────────────────

/** Labels of at most two words. */
const KPI_LABEL: Record<Kpi["key"], string> = {
  open: "Offene Vorgänge",
  missing: "Fehlende Berichte",
  sent: "Anzeigen",
  delay: "Verzugstage",
  claims: "Anspruchsgrundlage",
};

const fmtValue = (v: number, format: Kpi["format"]) => (format === "eur" ? `${Math.round(v).toLocaleString("de-DE")} €` : Math.round(v).toLocaleString("de-DE"));

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
  // A value that changes live flashes blue-50 once.
  const [prev, setPrev] = useState(kpi.value);
  const [flash, setFlash] = useState(0);
  if (kpi.value !== prev) {
    setPrev(kpi.value);
    setFlash((n) => n + 1);
  }
  const Arrow = kpi.delta > 0 ? ArrowUp : ArrowDown;
  return (
    <Tip
      content={
        <span className="flex flex-col gap-1">
          <span>{kpi.basis}</span>
          <span className="opacity-80">{kpi.delta_label}</span>
          {kpi.note && kpi.key === "missing" ? <span className="opacity-80">{kpi.note}</span> : null}
        </span>
      }
    >
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
        <p className="relative flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
          {KPI_LABEL[kpi.key]}
          {kpi.note && kpi.key === "claims" ? <span className="rounded border border-border px-1 text-[10px]">{kpi.note}</span> : null}
        </p>
        <div className="relative mt-1.5 flex items-end justify-between gap-3">
          <p className="font-mono text-[28px] leading-none font-medium tracking-tight whitespace-nowrap text-foreground tabular-nums">
            <AnimatedNumber value={kpi.value} format={kpi.format} />
          </p>
          <Sparkline values={kpi.spark} />
        </div>
        <p className="relative mt-2 flex h-4 items-center gap-1 font-mono text-xs text-muted-foreground tabular-nums">
          {kpi.delta === 0 ? (
            <span aria-label="unverändert gegenüber der Vorwoche">±0</span>
          ) : (
            <>
              <Arrow className="size-3 text-blue-600" aria-hidden />
              <span aria-label={kpi.delta_label}>{fmtValue(Math.abs(kpi.delta), kpi.format)}</span>
            </>
          )}
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

// ── Map ─────────────────────────────────────────────────────────────────

const PIN: Record<Exclude<CellStatus, "none">, string> = { green: "bg-light-green", amber: "bg-light-yellow", red: "bg-light-red" };

export function SiteMap({ v, onPick }: { v: DashboardView; onPick: ((id: string) => void) | null }) {
  return (
    <div className="relative mx-auto" style={{ aspectRatio: `${MAP_W} / ${MAP_H}`, height: 320, maxWidth: "100%" }}>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="absolute inset-0 size-full" aria-hidden>
        <path d={OUTLINE} fill="var(--color-zinc-50)" stroke="var(--color-zinc-300)" strokeWidth={1.5} />
        {DISTRICTS.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--color-zinc-200)" strokeWidth={1} />
        ))}
        <path d={ISAR} fill="none" stroke="var(--color-blue-200)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {v.site_map.map((s) => {
        const [x, y] = project(s.lat, s.lng);
        const status = s.status === "none" ? "green" : s.status;
        const label = `Baustelle ${s.code} · ${s.name}: ${s.open} ${s.open === 1 ? "offener Vorgang" : "offene Vorgänge"}, ${s.delay} Verzugstage`;
        const pin = (
          <span className="relative flex items-center gap-1.5" data-pin={s.code} data-status={status}>
            <Pulse status={status} />
            <span
              className={cn(
                "relative flex size-7 items-center justify-center rounded-full border-2 border-white font-mono text-xs font-semibold text-white shadow-sm transition-colors duration-300",
                PIN[status],
                status === "red" && "shadow-[0_0_0_6px_rgb(220_38_38_/_0.12)]",
              )}
            >
              {s.code}
            </span>
            <span className="text-xs font-medium whitespace-nowrap text-foreground">{s.short}</span>
          </span>
        );
        return (
          <div key={s.id} className="absolute -translate-y-1/2" style={{ left: `${(x / MAP_W) * 100}%`, top: `${(y / MAP_H) * 100}%`, marginLeft: -14 }}>
            <Tip content={<span>{label}</span>}>
              {onPick ? (
                <button type="button" onClick={() => onPick(s.id)} aria-label={`${label}. Filter setzen`} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {pin}
                </button>
              ) : (
                <span role="img" aria-label={label}>
                  {pin}
                </span>
              )}
            </Tip>
          </div>
        );
      })}
    </div>
  );
}

/** A red pin pulses twice when it turns red, then keeps a soft glow. */
function Pulse({ status }: { status: Exclude<CellStatus, "none"> }) {
  const reduce = useReducedMotion();
  const [prev, setPrev] = useState(status);
  const [n, setN] = useState(0);
  if (status !== prev) {
    setPrev(status);
    if (status === "red") setN((x) => x + 1);
  }
  if (!n || reduce || status !== "red") return null;
  return (
    <motion.span
      key={n}
      aria-hidden
      className="absolute top-0 left-0 size-7 rounded-full bg-light-red"
      initial={{ scale: 1, opacity: 0.5 }}
      animate={{ scale: 2.4, opacity: 0 }}
      transition={{ duration: 0.9, ease: "easeOut", repeat: 1 }}
    />
  );
}

// ── Handlungsbedarf ─────────────────────────────────────────────────────

export function Actions({ v, linkable }: { v: DashboardView; linkable: boolean }) {
  const reduce = useReducedMotion();
  const top = v.actions.items.slice(0, 3);
  return (
    <div className="flex flex-col gap-2">
      {top.length ? null : <Empty>Nichts zu tun.</Empty>}
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {top.map((a) => {
            const body = (
              <span className="flex h-12 items-center gap-3 rounded-lg border border-border px-3 text-sm text-foreground transition-colors hover:bg-muted">
                <Shape status={a.status} />
                <span className="min-w-0 flex-1 whitespace-nowrap">{a.text}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </span>
            );
            return (
              <motion.li
                key={a.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                data-action={a.kind}
              >
                <Tip content={<span>{a.detail}</span>}>
                  {linkable ? (
                    <Link href={a.href} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {body}
                    </Link>
                  ) : (
                    <span className="block">{body}</span>
                  )}
                </Tip>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {v.actions.ok.length ? (
        <details className="group mt-1 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-1 py-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <Shape status="green" />
            Alles im Plan ({v.actions.ok.length})
            <ChevronRight className="ml-auto size-4 transition-transform group-open:rotate-90" aria-hidden />
          </summary>
          <p className="mt-1 px-1 text-xs leading-relaxed text-muted-foreground">{v.actions.ok.join(", ")}</p>
        </details>
      ) : null}
    </div>
  );
}

// ── Heatmap ─────────────────────────────────────────────────────────────

const CELL: Record<CellStatus, string> = {
  green: "bg-light-green/12 text-light-green-text",
  amber: "bg-light-yellow/18 text-light-yellow-text",
  red: "bg-light-red text-white",
  none: "",
};

const timeFmt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
const dayKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });
const since = (iso: string, today: string) => (dayKey.format(new Date(iso)) === today ? timeFmt.format(new Date(iso)) : fmtDayDe(dayKey.format(new Date(iso))));

export function Heatmap({ v, linkable }: { v: DashboardView; linkable: boolean }) {
  const reduce = useReducedMotion();
  const { trades, rows } = v.heatmap;
  if (!rows.length || !trades.length) return <Empty>Keine laufenden Arbeiten im Filter.</Empty>;
  const short = (pid: string) => v.site_map.find((s) => s.id === pid)?.short ?? "";
  return (
    <div>
      <div role="table" aria-label="Gewerke je Baustelle" className="grid gap-1.5" style={{ gridTemplateColumns: `7rem repeat(${trades.length}, minmax(3.25rem,1fr))` }}>
        <span role="columnheader" />
        {trades.map((t) => (
          <span key={t} role="columnheader" className="pb-1 text-center text-xs whitespace-nowrap text-muted-foreground">
            {t}
          </span>
        ))}
        {rows.map((r, ri) => {
          const fade = { initial: reduce ? false : { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.35, delay: 0.1 + ri * 0.03 } } as const;
          return (
            <div key={r.project_id} role="row" className="contents">
              <motion.span role="rowheader" className="flex items-center gap-2 text-sm whitespace-nowrap" {...fade}>
                <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                <span className="text-foreground">{short(r.project_id)}</span>
              </motion.span>
              {r.cells.map((c) => {
                if (c.status === "none") return <span key={c.trade} role="cell" aria-label={`${r.code} ${c.trade}: keine laufenden Arbeiten`} />;
                const text = c.delay > 0 ? `+${c.delay}` : c.status === "red" ? "!" : "0";
                const tip = c.hindrance ? `Behinderung ${c.hindrance.reference} · seit ${since(c.hindrance.since, v.today)}${c.delay ? ` · Prognose +${c.delay} Tage` : ""}` : `${r.code} ${c.trade}: ${c.reason}`;
                const body = (
                  <span className={cn("flex h-10 items-center justify-center gap-1.5 rounded-md font-mono text-sm tabular-nums transition-colors duration-300", CELL[c.status])}>
                    <Shape status={c.status} className={c.status === "red" ? "bg-white" : undefined} />
                    {text}
                  </span>
                );
                return (
                  <motion.span key={c.trade} {...fade}>
                    <Tip content={<span>{tip}</span>}>
                      {linkable ? (
                        <Link
                          href={c.hindrance ? `/admin/case/${c.hindrance.id}` : `/admin/vorgaenge?site=${r.project_id}&trade=${encodeURIComponent(c.trade)}`}
                          aria-label={`${tip}. Öffnen`}
                          data-cell={`${r.code}-${c.trade}`}
                          data-status={c.status}
                          className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {body}
                        </Link>
                      ) : (
                        <span role="cell" aria-label={tip} data-cell={`${r.code}-${c.trade}`} data-status={c.status} className="block">
                          {body}
                        </span>
                      )}
                    </Tip>
                  </motion.span>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="mt-3 flex items-center gap-4 text-xs whitespace-nowrap text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Shape status="green" /> im Plan
        </span>
        <span className="flex items-center gap-1.5">
          <Shape status="amber" /> ≤ 2 Tage
        </span>
        <span className="flex items-center gap-1.5">
          <Shape status="red" /> &gt; 2 Tage / Behinderung
        </span>
        <InfoTip label="Was die Zahl bedeutet" text="Zahl = prognostizierte Verzugstage. Ohne Mengenmeldung seit zwei Arbeitstagen: ◆." />
      </p>
    </div>
  );
}

// ── Plan vs. Ist (bullet) ───────────────────────────────────────────────

export function TradeBullets({ v }: { v: DashboardView }) {
  const reduce = useReducedMotion();
  const bars = v.trade_bars.bars.slice(0, 6);
  if (!bars.length) return <Empty>Für diesen Filter sind keine Mengen geplant.</Empty>;
  return (
    <ul className="flex flex-col gap-3">
      {bars.map((b, i) => {
        const d = b.actual - b.plan;
        return (
          <li key={b.trade} className="grid grid-cols-[5.75rem_minmax(0,1fr)_2.25rem] items-center gap-3">
            <span className={cn("text-sm whitespace-nowrap", b.worst ? "font-medium text-foreground" : "text-foreground")}>{b.trade}</span>
            <Tip content={<span>{`${b.trade}: Ist ${b.actual} % fertig, Soll bis gestern ${b.plan} %`}</span>}>
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
            <span className={cn("text-right font-mono text-xs tabular-nums", b.worst ? "text-foreground" : "text-muted-foreground")}>{d === 0 ? "±0" : d > 0 ? `+${d}` : `−${Math.abs(d)}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Details: Mini-Bauablauf ────────────────────────────────────────────

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
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-3">
      <span />
      <div className="relative h-5 text-[11px] text-muted-foreground">
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 font-mono whitespace-nowrap" style={{ left: x(t) }}>
            {fmtDayDe(t).slice(0, 6)}
          </span>
        ))}
      </div>
      {s.rows.map((r, i) => (
        <div key={r.id} className="contents">
          <Tip content={<span>{r.activity}</span>}>
            <span className="py-2 text-sm whitespace-nowrap text-foreground">
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
                <span className="absolute top-0.5 flex h-5 items-center rounded-sm bg-light-red px-1 font-mono text-[11px] font-medium whitespace-nowrap text-white" style={{ left: x(h.start), minWidth: w(h.start, h.end) }}>
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
        <Key className="h-2.5 w-4 rounded-sm bg-zinc-200" text="Soll" />
        <Key className="h-2 w-4 rounded-sm bg-zinc-500" text="Prognose" />
        <Key className="h-2.5 w-4 rounded-sm bg-light-red" text="Behinderung" />
        <Key className="h-3 w-0.5 bg-blue-600" text="heute" />
      </p>
    </div>
  );
}

const Key = ({ className, text }: { className: string; text: string }) => (
  <span className="flex items-center gap-1.5 whitespace-nowrap">
    <span aria-hidden className={className} />
    {text}
  </span>
);

// ── Details: Tagesberichte ──────────────────────────────────────────────

export function CompletenessGrid({ v }: { v: DashboardView }) {
  const { rows, days } = v.completeness;
  if (!rows.length) return <Empty>Keine Teams mit geplanter Arbeit im Zeitraum.</Empty>;
  const small = days.length > 14;
  return (
    <div className="overflow-x-auto">
      <div className="grid items-center gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: "9rem minmax(0,1fr)" }}>
        {rows.map((r) => (
          <div key={r.team_id} className="contents">
            <span className="text-sm whitespace-nowrap text-foreground">
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
          </div>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Key className="size-3 rounded-[3px] bg-zinc-700" text="Bericht" />
        <Key className="size-3 rounded-[3px] border-2 border-light-red" text="fehlt" />
        <Key className="size-3 rounded-[3px] bg-zinc-100" text="keine Arbeit" />
      </p>
    </div>
  );
}

// ── Details: Dokumente ──────────────────────────────────────────────────

const PIPE_TONE = ["bg-zinc-200", "bg-zinc-300", "bg-zinc-400", "bg-zinc-600", "bg-zinc-800"];
const PIPE_LABEL: Record<string, string> = { entwurf: "Entwurf", unvollstaendig: "Unvollst.", bereit: "Bereit", validiert: "Validiert", versendet: "Versendet" };

export function Pipeline({ v }: { v: DashboardView }) {
  const reduce = useReducedMotion();
  const steps = v.pipeline.steps;
  const total = steps.reduce((s, x) => s + x.count, 0);
  if (!total) return <Empty>Noch keine Schreiben in diesem Filter.</Empty>;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-sm bg-zinc-100" role="img" aria-label={steps.map((s) => `${PIPE_LABEL[s.status]} ${s.count}`).join(", ")}>
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
      <ol className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
        {steps.map((s, i) =>
          s.count ? (
            <li key={s.status} className="whitespace-nowrap">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-[2px]", PIPE_TONE[i])} />
                {PIPE_LABEL[s.status]}
              </p>
              <p className="mt-0.5 font-mono text-xl font-medium text-foreground tabular-nums">{s.count}</p>
            </li>
          ) : (
            <li key={s.status} className="pb-1 text-xs whitespace-nowrap text-zinc-400">
              {PIPE_LABEL[s.status]} 0
            </li>
          ),
        )}
      </ol>
    </div>
  );
}

// ── Details: Aktivitäten ────────────────────────────────────────────────

const SOURCE: Record<FeedSource, { icon: typeof Phone; label: string }> = {
  call: { icon: Phone, label: "Telefonat" },
  meeting: { icon: Users, label: "Meeting" },
  email: { icon: Mail, label: "E-Mail" },
  checkin: { icon: ClipboardCheck, label: "Check-in" },
  system: { icon: Building2, label: "Büro" },
};
const dateFmt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" });

export function ActivityFeed({ v, linkable }: { v: DashboardView; linkable: boolean }) {
  if (!v.feed.length) return <Empty>Im Zeitraum ist nichts passiert.</Empty>;
  return (
    <ol className="-mx-2 flex flex-col">
      {v.feed.map((f) => {
        const S = SOURCE[f.source];
        const at = new Date(f.at);
        const when = dayKey.format(at) === v.today ? timeFmt.format(at) : dateFmt.format(at);
        const body = (
          <span className="flex gap-3 rounded-lg px-2 py-2">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground" title={S.label}>
              <S.icon className="size-3.5" aria-label={S.label} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{f.title}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{when}</span>
              </span>
              <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{[f.ref, f.code ? `Baustelle ${f.code}` : null].filter(Boolean).join(" · ")}</span>
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
