"use client";
// Portfolio (/admin) and project (/admin/project/[id]) dashboard. Filters live
// in the URL; data refetches on every live change (realtime-client), so a new
// case or report updates the KPIs and heatmap without a reload.
import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { PERIODS, type DashboardFilters, type DashboardView, type Period } from "@/lib/dashboard/compute";
import { fmtDateTime } from "@/lib/labels";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { ActivityFeed, Card, CompletenessGrid, Heatmap, KpiCard, MiniSchedule, Pipeline, TradeBullets } from "./widgets";

const query = (f: DashboardFilters) => {
  const p = new URLSearchParams();
  if (f.project) p.set("site", f.project);
  if (f.team) p.set("team", f.team);
  if (f.trade) p.set("trade", f.trade);
  if (f.days !== 14) p.set("days", String(f.days));
  return p.toString();
};

export function Dashboard({ initial, fixedProject = null }: { initial: DashboardFilters; fixedProject?: string | null }) {
  const [filters, setFilters] = useState<DashboardFilters>({ ...initial, project: fixedProject ?? initial.project });
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] px-6 pt-5 pb-10">
          <FilterBar v={data} filters={filters} fixedProject={fixedProject} onChange={update} />
          {error && !data ? (
            <p role="alert" className="mt-6 rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground">
              Das Dashboard konnte nicht geladen werden: {error}
            </p>
          ) : data ? (
            <DashboardBody v={data} linkable />
          ) : (
            <Loading />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

/** The widgets for one computed view (also used by the pitch, without links). */
export function DashboardBody({ v, linkable }: { v: DashboardView; linkable: boolean }) {
  return (
    <>
      <div className="mt-4 grid grid-cols-5 gap-3">
        {v.kpis.map((k, i) => (
          <KpiCard key={k.key} kpi={k} index={i} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_340px] gap-3">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-3">
            <Card topic="Baustelle × Gewerk" title={v.heatmap.title}>
              <Heatmap v={v} linkable={linkable} />
            </Card>
            <Card topic="Plan und Ist je Gewerk" title={v.trade_bars.title}>
              <TradeBullets v={v} />
            </Card>
          </div>
          <Card topic={`Bauablauf Baustelle ${v.schedule.code} · ${v.schedule.name}`} title={v.schedule.title}>
            <MiniSchedule v={v} linkable={linkable} />
          </Card>
          <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3">
            <Card topic={`Tagesberichte, letzte ${v.filters.days} Tage`} title={v.completeness.title}>
              <CompletenessGrid v={v} />
            </Card>
            <Card topic="Dokumenten-Pipeline" title={v.pipeline.title}>
              <Pipeline v={v} />
            </Card>
          </div>
        </div>
        <Card topic="Aktivitäten" title="Was zuletzt passiert ist" className="self-start">
          <ActivityFeed v={v} linkable={linkable} />
        </Card>
      </div>
    </>
  );
}

function FilterBar({
  v,
  filters,
  fixedProject,
  onChange,
}: {
  v: DashboardView | undefined;
  filters: DashboardFilters;
  fixedProject: string | null;
  onChange: (p: Partial<DashboardFilters>) => void;
}) {
  const site = v?.sites.find((s) => s.id === (fixedProject ?? filters.project));
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{site ? `Baustelle ${site.code} · ${site.name}` : "Alle Baustellen"}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {v ? (
            <>
              Stand <span className="font-mono">{fmtDateTime(v.now)}</span> · aus Bauzeitenplan, Mengen, Tagesberichten und Vorgängen berechnet
            </>
          ) : (
            "Wird berechnet …"
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {fixedProject ? null : (
          <Select label="Baustelle" value={filters.project ?? ""} onChange={(x) => onChange({ project: x || null })}>
            <option value="">Alle Baustellen</option>
            {v?.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </Select>
        )}
        <Select label="Team" value={filters.team ?? ""} onChange={(x) => onChange({ team: x || null })}>
          <option value="">Alle Teams</option>
          {v?.teams
            .filter((t) => !filters.project || t.project_id === filters.project)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} · {t.name}
              </option>
            ))}
        </Select>
        <Select label="Gewerk" value={filters.trade ?? ""} onChange={(x) => onChange({ trade: x || null })}>
          <option value="">Alle Gewerke</option>
          {v?.trade_names.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <div role="group" aria-label="Zeitraum" className="inline-flex h-9 rounded-lg border border-border bg-background p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={filters.days === p}
              onClick={() => onChange({ days: p as Period })}
              className={cn(
                "rounded-md px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filters.days === p ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p} Tage
            </button>
          ))}
        </div>
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
        className="h-9 max-w-56 appearance-none rounded-lg border border-border bg-background pr-8 pl-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-3">
        <Skeleton className="h-[640px] rounded-xl" />
        <Skeleton className="h-[640px] rounded-xl" />
      </div>
    </div>
  );
}
