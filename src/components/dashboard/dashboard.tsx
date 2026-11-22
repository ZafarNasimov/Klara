"use client";
// Portfolio (/admin) and project (/admin/project/[id]) dashboard. Filters live
// in the URL; data refetches on every live change (realtime-client), so a new
// case or report updates the KPIs, the map, the heatmap and "Handlungsbedarf"
// without a reload. Tab "Überblick" (default) and "Details".
import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { PERIODS, type DashboardFilters, type DashboardView, type Period } from "@/lib/dashboard/compute";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { Actions, ActivityFeed, Card, CompletenessGrid, Heatmap, HeatLegend, InfoTip, KpiCard, MiniSchedule, Pipeline, SiteMap, TradeBullets } from "./widgets";

// At ≥ 760 px viewport height the Überblick fills the screen exactly; below, the page scrolls.
// (Class names are written out in full: Tailwind only generates what it finds literally in the source.)

type Tab = "overview" | "details";

const query = (f: DashboardFilters) => {
  const p = new URLSearchParams();
  if (f.project) p.set("site", f.project);
  if (f.team) p.set("team", f.team);
  if (f.trade) p.set("trade", f.trade);
  if (f.days !== 14) p.set("days", String(f.days));
  return p.toString();
};

const standFmt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
/** "21.11. · 23:07" */
const stand = (iso: string) => {
  const parts = Object.fromEntries(standFmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.day}.${parts.month}. · ${parts.hour}:${parts.minute}`;
};

export function Dashboard({ initial, fixedProject = null }: { initial: DashboardFilters; fixedProject?: string | null }) {
  const [filters, setFilters] = useState<DashboardFilters>({ ...initial, project: fixedProject ?? initial.project });
  const [tab, setTab] = useState<Tab>("overview");
  const { data, error } = useApi<DashboardView>(`/api/dashboard?${query(filters)}`);

  const update = (patch: Partial<DashboardFilters>) => {
    const next = { ...filters, ...patch };
    // A team belongs to one site: changing the site clears a team of another site.
    if (patch.project !== undefined && data && next.team && data.teams.find((t) => t.id === next.team)?.project_id !== next.project) next.team = null;
    setFilters(next);
    const q = query({ ...next, project: fixedProject ? null : next.project });
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  };

  return (
    <TooltipProvider delay={150}>
      <div className="min-h-0 flex-1 overflow-y-auto" data-dash-scroll>
        <div className={cn("mx-auto flex max-w-[1600px] flex-col px-6 pt-3 pb-4", tab === "overview" ? "[@media(min-height:760px)]:h-full" : "pb-10")}>
          <FilterBar v={data} filters={filters} fixedProject={fixedProject} onChange={update} tab={tab} onTab={setTab} />
          {error && !data ? (
            <p role="alert" className="mt-6 rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground">
              Das Dashboard konnte nicht geladen werden: {error}
            </p>
          ) : data ? (
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1">
              {tab === "overview" ? (
                <Overview v={data} linkable onPick={fixedProject ? null : (id) => update({ project: filters.project === id ? null : id })} />
              ) : (
                <Details v={data} linkable />
              )}
            </div>
          ) : (
            <Loading />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

/** Tab "Überblick": KPIs, map + Handlungsbedarf, heatmap + Plan und Ist (also the pitch, without links). */
export function Overview({ v, linkable, onPick = null, className }: { v: DashboardView; linkable: boolean; onPick?: ((id: string) => void) | null; className?: string }) {
  return (
    <div className={cn("mt-3 grid gap-4 [@media(min-height:760px)]:h-full [@media(min-height:760px)]:grid-rows-[auto_minmax(220px,1fr)_minmax(200px,1fr)]", className)}>
      <div className="grid grid-cols-4 gap-4">
        {v.kpis
          .filter((k) => k.key !== "claims")
          .map((k, i) => (
            <KpiCard key={k.key} kpi={k} index={i} />
          ))}
      </div>
      <div className="grid min-h-0 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <Card title="Baustellen">
          <SiteMap v={v} onPick={onPick} />
        </Card>
        <Card title="Handlungsbedarf">
          <Actions v={v} linkable={linkable} />
        </Card>
      </div>
      <div className="grid min-h-0 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <Card title="Gewerke" action={<HeatLegend />}>
          <Heatmap v={v} linkable={linkable} />
        </Card>
        <Card title="Plan/Ist">
          <TradeBullets v={v} />
        </Card>
      </div>
    </div>
  );
}

/** Tab "Details": pipeline, claims, feed, mini schedule, reporting grid. */
function Details({ v, linkable }: { v: DashboardView; linkable: boolean }) {
  const claims = v.kpis.find((k) => k.key === "claims");
  return (
    <div className="mt-4 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
      <div className="flex min-w-0 flex-col gap-3">
        <Card title={`Bauablauf ${v.site_map.find((s) => s.id === v.schedule.project_id)?.short ?? v.schedule.code}`}>
          <MiniSchedule v={v} linkable={linkable} />
        </Card>
        <Card title="Tagesberichte">
          <CompletenessGrid v={v} />
        </Card>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <Card title="Dokumente">
          <Pipeline v={v} />
        </Card>
        {claims ? <KpiCard kpi={claims} index={0} /> : null}
        <Card title="Aktivitäten">
          <ActivityFeed v={v} linkable={linkable} />
        </Card>
      </div>
    </div>
  );
}

function FilterBar({
  v,
  filters,
  fixedProject,
  onChange,
  tab,
  onTab,
}: {
  v: DashboardView | undefined;
  filters: DashboardFilters;
  fixedProject: string | null;
  onChange: (p: Partial<DashboardFilters>) => void;
  tab: Tab;
  onTab: (t: Tab) => void;
}) {
  const site = v?.sites.find((s) => s.id === (fixedProject ?? filters.project));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight whitespace-nowrap text-foreground">{site ? `Baustelle ${site.code} · ${site.name}` : "Alle Baustellen"}</h1>
          {v ? <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">Stand {stand(v.now)}</span> : null}
          <InfoTip label="Woher die Zahlen kommen" text="Aus Bauzeitenplan, Mengen, Tagesberichten und Vorgängen berechnet; aktualisiert sich bei jeder neuen Meldung." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {fixedProject ? null : (
            <Select label="Baustelle" value={filters.project ?? ""} onChange={(x) => onChange({ project: x || null })}>
              <option value="">Baustellen</option>
              {v?.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </Select>
          )}
          <Select label="Team" value={filters.team ?? ""} onChange={(x) => onChange({ team: x || null })}>
            <option value="">Teams</option>
            {v?.teams
              .filter((t) => !filters.project || t.project_id === filters.project)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name}
                </option>
              ))}
          </Select>
          <Select label="Gewerk" value={filters.trade ?? ""} onChange={(x) => onChange({ trade: x || null })}>
            <option value="">Gewerke</option>
            {v?.trade_names.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <div role="group" aria-label="Zeitraum in Tagen" className="inline-flex h-9 items-center rounded-lg border border-border bg-background p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={filters.days === p}
                aria-label={`${p} Tage`}
                onClick={() => onChange({ days: p as Period })}
                className={cn(
                  "rounded-md px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filters.days === p ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p}
              </button>
            ))}
            <span className="px-2 text-sm text-muted-foreground">Tage</span>
          </div>
        </div>
      </div>
      <div role="tablist" aria-label="Ansicht" className="flex gap-1 border-b border-border">
        {(
          [
            ["overview", "Überblick"],
            ["details", "Details"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            id={`tab-${id}`}
            role="tab"
            type="button"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => onTab(id)}
            className={cn(
              "-mb-px border-b-2 px-3 pb-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === id ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 appearance-none rounded-lg border border-border bg-background pr-8 pl-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </select>
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

function Loading() {
  return (
    <div className="mt-4 space-y-3" aria-busy>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
        <Skeleton className="h-[380px] rounded-xl" />
        <Skeleton className="h-[380px] rounded-xl" />
      </div>
    </div>
  );
}
