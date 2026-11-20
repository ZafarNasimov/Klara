"use client";
// /admin: project tree left, case table center, detail panel right (SPEC §8).
import Link from "next/link";
import { useState } from "react";
import { Building2, ChevronRight, Users } from "lucide-react";
import { CheckList, LightSummary } from "@/components/klara/traffic-light";
import { CASE_STATUS_DE, SPHERE_DE, fmtDateTime } from "@/lib/labels";
import { docTitle } from "@/lib/doctypes/titles";
import type { ProjectContext } from "@/lib/db/repo";
import type { Case } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

export function CaseBoard() {
  const { data: ctx } = useApi<ProjectContext>("/api/project", { live: false });
  const { data: cases, loading } = useApi<Case[]>("/api/cases");
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = (cases ?? []).filter((c) => !teamFilter || c.team_id === teamFilter);
  const selected = visible.find((c) => c.id === selectedId) ?? null;
  const userName = (id: string | null) => ctx?.users.find((u) => u.id === id)?.name ?? "–";

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_380px]">
      {/* Project tree */}
      <aside className="border-r border-border bg-background p-3" aria-label="Projekte">
        {ctx && (
          <div>
            <button
              type="button"
              onClick={() => setTeamFilter(null)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                !teamFilter && "bg-secondary",
              )}
            >
              <Building2 className="size-4 text-muted-foreground" aria-hidden />
              <span className="truncate">{ctx.project.name}</span>
            </button>
            <ul className="mt-1 ml-3 border-l border-border pl-2">
              {ctx.teams.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setTeamFilter(t.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                      teamFilter === t.id && "bg-secondary text-foreground",
                    )}
                  >
                    <Users className="size-4" aria-hidden />
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {/* Case table */}
      <main className="min-w-0 overflow-auto p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="text-xl font-semibold text-foreground">Vorgänge</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{visible.length}</span> insgesamt
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Vorgang</th>
                <th className="px-3 py-2 font-medium">Zeichen</th>
                <th className="px-3 py-2 font-medium">Gemeldet von</th>
                <th className="px-3 py-2 font-medium">Bearbeitung</th>
                <th className="px-3 py-2 font-medium">Erstellt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn("cursor-pointer hover:bg-muted", selectedId === c.id && "bg-blue-50/60")}
                >
                  <td className="max-w-56 px-3 py-2.5">
                    <LightSummary checks={c.checks} />
                  </td>
                  <td className="px-3 py-2.5 font-medium text-foreground">
                    <Link
                      href={`/admin/case/${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {docTitle(c.doc_type)}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-muted-foreground">{c.reference}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{userName(c.created_by)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{CASE_STATUS_DE[c.status]}</td>
                  <td className="px-3 py-2.5 font-mono text-muted-foreground">{fmtDateTime(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && visible.length === 0 && (
            <div className="px-6 py-14 text-center">
              <p className="text-base font-medium text-foreground">Noch keine Vorgänge</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sobald ein Polier ein Ereignis an Klara meldet, erscheint es hier.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Detail panel */}
      <aside className="overflow-auto border-l border-border bg-background p-5" aria-label="Details">
        {selected ? (
          <div className="space-y-5">
            <div>
              <p className="font-mono text-sm text-muted-foreground">{selected.reference}</p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">{docTitle(selected.doc_type)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {CASE_STATUS_DE[selected.status]}
                {selected.sphere ? `, Sphäre: ${SPHERE_DE[selected.sphere]}` : ""}
              </p>
            </div>
            {selected.checks.length > 0 && <CheckList checks={selected.checks} />}
            <Link
              href={`/admin/case/${selected.id}`}
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Vorgang öffnen
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Wählen Sie einen Vorgang, um Prüfungen und Details zu sehen.</p>
        )}
      </aside>
    </div>
  );
}
