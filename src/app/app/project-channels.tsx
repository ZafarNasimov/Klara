"use client";
import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectContext } from "@/lib/db/repo";
import { LANGUAGE_DE } from "@/lib/labels";
import type { CaseView } from "@/lib/types";
import { useApi } from "@/lib/use-api";

type ProjectResponse = ProjectContext & { now: string };

/** Project → team channels (SPEC §8 /app). */
export function ProjectChannels() {
  const { data: ctx, error } = useApi<ProjectResponse>("/api/project", { live: false });
  const { data: cases } = useApi<CaseView[]>("/api/cases");

  if (error) return <p className="p-4 text-sm text-light-red-text">{error}</p>;
  if (!ctx) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const openCount = (teamId: string) =>
    cases?.filter((c) => c.team_id === teamId && ["unvollstaendig", "bereit", "validiert"].includes(c.status)).length ?? 0;

  return (
    <main className="flex-1 px-4 py-5">
      <section aria-labelledby="project-title">
        <h2 id="project-title" className="text-lg font-semibold text-foreground">
          {ctx.project.name}
        </h2>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {ctx.project.address}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {ctx.project.contract_type === "VOB_B" ? "VOB/B-Vertrag" : "BGB-Vertrag"} <span className="font-mono">{ctx.project.contract_no}</span>
        </p>
      </section>

      <h3 className="mt-6 mb-2 text-sm font-medium text-muted-foreground">Teamkanäle</h3>
      <ul className="overflow-hidden rounded-xl border border-border">
        {ctx.teams.map((team) => {
          const lead = ctx.users.find((u) => u.id === team.lead_user_id);
          const n = openCount(team.id);
          return (
            <li key={team.id} className="border-b border-border last:border-b-0">
              <Link
                href={`/app/channel/${team.id}`}
                className="flex min-h-18 items-center gap-3 px-4 py-3 outline-none hover:bg-surface focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground" aria-hidden>
                  {team.name.replace(/^Team\s+/, "").slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-foreground">{team.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {lead ? `${lead.name}, ${LANGUAGE_DE[lead.language] ?? lead.language}` : "Kein Polier zugeordnet"}
                  </span>
                </span>
                {n > 0 ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                    {n} offen
                  </span>
                ) : null}
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
