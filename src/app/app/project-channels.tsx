"use client";
import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectSummary } from "@/app/api/projects/route";
import { LANGUAGE_DE } from "@/lib/labels";
import { useApi } from "@/lib/use-api";

/** Sites → team channels (SPEC §8 /app). */
export function ProjectChannels() {
  const { data: projects, error } = useApi<ProjectSummary[]>("/api/projects");

  if (error) return <p className="p-4 text-sm text-light-red-text">{error}</p>;
  if (!projects) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <main className="flex-1 space-y-8 px-4 py-5">
      {projects.map((p) => (
        <section key={p.id} aria-labelledby={`project-${p.id}`}>
          <h2 id={`project-${p.id}`} className="text-lg font-semibold text-foreground">
            {p.name}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {p.address}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {p.contract_type === "VOB_B" ? "VOB/B-Vertrag" : "BGB-Vertrag"} <span className="font-mono">{p.contract_no}</span>
          </p>

          <h3 className="mt-4 mb-2 text-sm font-medium text-muted-foreground">Teamkanäle</h3>
          <ul className="overflow-hidden rounded-xl border border-border">
            {p.teams.map((team) => (
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
                      {team.lead_name
                        ? `${team.lead_name}, ${team.lead_language ? (LANGUAGE_DE[team.lead_language] ?? team.lead_language) : "Sprache offen"}`
                        : "Kein Polier zugeordnet"}
                    </span>
                  </span>
                  {team.open_cases > 0 ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{team.open_cases} offen</span>
                  ) : null}
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
