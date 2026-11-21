"use client";
// Office overview (SPEC §8 /admin): project tree left, case table center,
// details right; deadlines today/tomorrow and red flags on top.
import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Building2, Users } from "lucide-react";
import { DeadlineBadge } from "@/components/klara/deadline-badge";
import { CheckList, LightDot, LightSummary, overallLight } from "@/components/klara/traffic-light";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectContext } from "@/lib/db/repo";
import { docTitle, fieldLabel, getDocType, hasValue } from "@/lib/doctypes";
import { CASE_STATUS_DE, fmtShort, fmtTime, SPHERE_DE } from "@/lib/labels";
import type { AppEvent, CaseView } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { eventDetail, eventTitle } from "./event-text";
import { formatFact } from "./format-fact";

type ProjectResponse = ProjectContext & { now: string };

const OPEN = new Set(["unvollstaendig", "bereit", "validiert"]);

export function CaseBoard() {
  const { data: ctx } = useApi<ProjectResponse>("/api/project");
  const { data: cases, error } = useApi<CaseView[]>("/api/cases");
  const { data: events } = useApi<AppEvent[]>("/api/events?limit=30");
  // Trades a meeting put behind schedule ("at risk"), newest event per trade.
  const tradeDelays = new Map<string, { days: number; area: string }>();
  for (const e of events ?? []) {
    const p = e.payload as { trade?: unknown; delay_days?: unknown; area?: unknown };
    if (e.kind === "meeting_schedule" && typeof p.trade === "string" && typeof p.delay_days === "number" && !tradeDelays.has(p.trade)) {
      tradeDelays.set(p.trade, { days: p.delay_days, area: String(p.area ?? "") });
    }
  }
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<"open" | "all">("open");

  // Drafts still being collected in a call are not shown to the office.
  const visible = useMemo(() => (cases ?? []).filter((c) => c.status !== "entwurf"), [cases]);
  const rows = useMemo(
    () =>
      visible.filter((c) => (teamFilter ? c.team_id === teamFilter : true)).filter((c) => (scope === "open" ? OPEN.has(c.status) : true)),
    [visible, teamFilter, scope],
  );
  const selected = rows.find((c) => c.id === selectedId) ?? null;

  const dueToday = visible.filter((c) => OPEN.has(c.status) && c.deadline && c.deadline.status !== "ok");
  const tomorrow = ctx ? berlinDayOffset(ctx.now, 1) : null;
  const dueTomorrow = visible.filter(
    (c) => OPEN.has(c.status) && c.deadline?.status === "ok" && c.deadline.due_at && berlinDayOffset(c.deadline.due_at, 0) === tomorrow,
  );
  const redFlags = visible.filter(
    (c) => OPEN.has(c.status) && (overallLight(c.checks) === "red" || c.flags.includes("escalate") || c.flags.includes("internal_risk")),
  );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[232px_minmax(0,1fr)_380px]">
      {/* ── Project tree ─────────────────────────────────────────── */}
      <aside aria-label="Projekte" className="min-h-0 overflow-y-auto border-r border-border bg-background px-3 py-4">
        {ctx ? (
          <>
            <p className="flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
              <Building2 className="size-3.5" aria-hidden />
              {ctx.company.name}
            </p>
            <button
              type="button"
              onClick={() => setTeamFilter(null)}
              aria-pressed={teamFilter === null}
              className={cn(
                "mt-2 w-full rounded-md px-2 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                teamFilter === null ? "bg-muted font-medium text-foreground" : "text-foreground hover:bg-muted",
              )}
            >
              {ctx.project.name}
              <span className="block text-xs font-normal text-muted-foreground">
                {ctx.project.contract_type === "VOB_B" ? "VOB/B" : "BGB"}, <span className="font-mono">{ctx.project.contract_no}</span>
              </span>
            </button>
            <ul className="mt-1 space-y-0.5 border-l border-border pl-2 ml-3">
              {ctx.teams.map((t) => {
                const n = visible.filter((c) => c.team_id === t.id && OPEN.has(c.status)).length;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setTeamFilter(t.id)}
                      aria-pressed={teamFilter === t.id}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        teamFilter === t.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Users className="size-3.5 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{t.name}</span>
                      {n > 0 ? <span className="font-mono text-xs text-foreground">{n}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <h2 className="mt-6 px-2 text-xs font-medium text-muted-foreground">Gewerke</h2>
            <ul className="mt-1 space-y-1 px-2">
              {ctx.trades.map((t) => {
                const late = tradeDelays.get(t.name);
                return (
                  <li key={t.id} className="text-sm">
                    <span className="text-foreground">{t.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t.contracted_by === "client" ? "vom Bauherrn beauftragt" : t.team_id ? "eigene Kolonne" : "eigener Nachunternehmer"}
                    </span>
                    {late ? (
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-light-yellow-text">
                        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-light-yellow" />
                        Verzug +{late.days} {late.days === 1 ? "Arbeitstag" : "Arbeitstage"} · {late.area} (Besprechung)
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
      </aside>

      {/* ── Case table ───────────────────────────────────────────── */}
      <main className="min-h-0 overflow-y-auto px-6 py-5">
        <section aria-label="Fristen und Hinweise" className="grid grid-cols-3 gap-3">
          <Summary title="Fristen heute" count={dueToday.length} light={dueToday.length ? "yellow" : null} items={dueToday} onPick={setSelectedId} />
          <Summary title="Fristen morgen" count={dueTomorrow.length} light={null} items={dueTomorrow} onPick={setSelectedId} />
          <Summary title="Rote Hinweise" count={redFlags.length} light={redFlags.length ? "red" : null} items={redFlags} onPick={setSelectedId} />
        </section>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Vorgänge</h1>
            <p className="text-sm text-muted-foreground">
              {teamFilter ? ctx?.teams.find((t) => t.id === teamFilter)?.name : "Alle Teams"}, {rows.length} {rows.length === 1 ? "Vorgang" : "Vorgänge"}
            </p>
          </div>
          <div role="radiogroup" aria-label="Filter" className="inline-flex rounded-lg border border-border bg-background p-0.5">
            {(["open", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={scope === s}
                onClick={() => setScope(s)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  scope === s ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "open" ? "Offen" : "Alle"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-background">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-[118px]" />
              <col className="w-[150px]" />
              <col className="w-[112px]" />
              <col className="w-[230px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Dokument und Ampel</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Zeichen</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Verfasser</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Frist</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-light-red-text">{error}</td>
                </tr>
              ) : !cases ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4">
                    <Skeleton className="h-9 w-full" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {scope === "open" ? "Keine offenen Vorgänge. Neue Meldungen von der Baustelle erscheinen hier sofort." : "Noch keine Vorgänge."}
                  </td>
                </tr>
              ) : (
                <AnimatePresence initial={false}>
                  {rows.map((c) => (
                    <motion.tr
                      key={c.id}
                      layout="position"
                      initial={{ opacity: 0, backgroundColor: "#eff6ff" }}
                      animate={{ opacity: 1, backgroundColor: selectedId === c.id ? "#fafafa" : "#ffffff" }}
                      transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                      onClick={() => setSelectedId(c.id)}
                      aria-selected={selectedId === c.id}
                      className={cn(
                        "cursor-pointer border-b border-border last:border-b-0",
                        selectedId === c.id && "shadow-[inset_3px_0_0_var(--primary)]",
                      )}
                    >
                      <td className="px-4 py-3 align-top">
                        <button
                          type="button"
                          onClick={() => setSelectedId(c.id)}
                          className="block max-w-full truncate text-left font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {docTitle(c.doc_type)}
                        </button>
                        <LightSummary checks={c.checks} compact className="mt-1" />
                      </td>
                      <td className="px-3 py-3 align-top font-mono text-[13px] text-foreground">{c.reference}</td>
                      <td className="px-3 py-3 align-top">
                        <span className="block truncate text-foreground">{c.author_name ?? "–"}</span>
                        <span className="block truncate text-xs text-muted-foreground">{c.team_name}</span>
                      </td>
                      <td className="px-3 py-3 align-top text-foreground">{CASE_STATUS_DE[c.status]}</td>
                      <td className="px-3 py-3 align-top">
                        <DeadlineBadge d={c.deadline} />
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* ── Detail panel ─────────────────────────────────────────── */}
      <aside aria-label="Details" className="min-h-0 overflow-y-auto border-l border-border bg-background">
        {selected ? <CaseDetailPanel c={selected} /> : <RecentEvents events={events} />}
      </aside>
    </div>
  );
}

function Summary({
  title,
  count,
  light,
  items,
  onPick,
}: {
  title: string;
  count: number;
  light: "yellow" | "red" | null;
  items: CaseView[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {light ? <LightDot light={light} /> : null}
        {title}
      </p>
      <p className="mt-1 font-mono text-2xl font-semibold text-foreground">{count}</p>
      {items.length ? (
        <ul className="mt-1 space-y-0.5">
          {items.slice(0, 2).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c.id)}
                className="max-w-full truncate text-left text-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-mono">{c.reference}</span> {docTitle(c.doc_type)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CaseDetailPanel({ c }: { c: CaseView }) {
  const def = getDocType(c.doc_type);
  const facts = def
    ? def.fields.filter((f) => hasValue(c.facts[f.key])).map((f) => ({ key: f.key, label: f.label_de, value: formatFact(f.type, c.facts[f.key]) }))
    : [];
  return (
    <div className="px-5 py-5">
      <p className="font-mono text-xs text-muted-foreground">{c.reference}</p>
      <h2 className="mt-1 text-base font-semibold text-foreground">{docTitle(c.doc_type)}</h2>
      {def ? <p className="text-sm text-muted-foreground">{def.legal_basis}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-7 items-center rounded-md border border-border px-2 text-sm text-foreground">{CASE_STATUS_DE[c.status]}</span>
        <DeadlineBadge d={c.deadline} />
      </div>
      <Link
        href={`/admin/case/${c.id}`}
        className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Vorgang öffnen
        <ArrowUpRight className="size-4" aria-hidden />
      </Link>

      <h3 className="mt-6 text-sm font-medium text-foreground">Prüfungen</h3>
      <CheckList checks={c.checks} className="mt-1" />

      {c.sphere ? (
        <>
          <h3 className="mt-5 text-sm font-medium text-foreground">Sphäre</h3>
          <p className="mt-1 text-sm text-muted-foreground">{SPHERE_DE[c.sphere]}</p>
        </>
      ) : null}

      <h3 className="mt-5 text-sm font-medium text-foreground">Angaben</h3>
      <dl className="mt-1 divide-y divide-border">
        {facts.map((f) => (
          <div key={f.key} className="py-2">
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className="text-sm text-foreground">{f.value}</dd>
          </div>
        ))}
        {c.missing_fields.map((k) => (
          <div key={k} className="flex items-start gap-2 py-2">
            <LightDot light="yellow" className="mt-1.5" />
            <div>
              <dt className="text-xs text-muted-foreground">{fieldLabel(c.doc_type, k)}</dt>
              <dd className="text-sm text-light-yellow-text">fehlt</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RecentEvents({ events }: { events: AppEvent[] | undefined }) {
  const shown = (events ?? []).filter((e) => eventTitle(e));
  return (
    <div className="px-5 py-5">
      <h2 className="text-sm font-medium text-foreground">Letzte Ereignisse</h2>
      {shown.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Noch nichts passiert. Wählen Sie einen Vorgang, um Details zu sehen.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          <AnimatePresence initial={false}>
            {shown.map((e) => (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="grid grid-cols-[44px_1fr] gap-2"
              >
                <time className="pt-px font-mono text-xs text-muted-foreground" dateTime={e.created_at} title={fmtShort(e.created_at)}>
                  {fmtTime(e.created_at)}
                </time>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{eventTitle(e)}</p>
                  {eventDetail(e) ? <p className="truncate text-xs text-muted-foreground">{eventDetail(e)}</p> : null}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}

/** Berlin calendar day of an ISO instant shifted by n days (client-side, no holiday tables). */
function berlinDayOffset(iso: string, days: number): string {
  const d = new Date(new Date(iso).getTime() + days * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
