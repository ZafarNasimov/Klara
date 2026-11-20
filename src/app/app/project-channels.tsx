"use client";
import Link from "next/link";
import { ChevronRight, MapPin, Users } from "lucide-react";
import { MobileFooterRole, MobileHeader } from "@/components/mobile/mobile-header";
import { useApi } from "@/lib/use-api";
import type { ProjectContext } from "@/lib/db/repo";
import { Skeleton } from "@/components/ui/skeleton";

export function ProjectChannels() {
  const { data, error } = useApi<ProjectContext>("/api/project", { live: false });

  return (
    <>
      <MobileHeader title="Baustellen" subtitle="Muster Bau GmbH" />
      <main className="flex-1 px-4 py-5">
        {error && <p className="text-sm text-light-red">{error}</p>}
        {!data && !error && <Skeleton className="h-40 w-full rounded-xl" />}
        {data && (
          <section aria-labelledby="proj" className="rounded-xl border border-border">
            <div className="border-b border-border px-4 py-3">
              <h2 id="proj" className="text-base font-semibold text-foreground">
                {data.project.name}
              </h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-3.5" aria-hidden />
                {data.project.address}
              </p>
            </div>
            <ul className="divide-y divide-border">
              {data.teams.map((t) => {
                const lead = data.users.find((u) => u.id === t.lead_user_id);
                return (
                  <li key={t.id}>
                    <Link
                      href={`/app/channel/${t.id}`}
                      className="flex min-h-16 items-center gap-3 px-4 py-3 outline-none hover:bg-muted focus-visible:bg-muted"
                    >
                      <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
                        <Users className="size-5 text-foreground" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-medium text-foreground">{t.name}</span>
                        {lead && (
                          <span className="block text-sm text-muted-foreground">Polier: {lead.name}</span>
                        )}
                      </span>
                      <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
      <MobileFooterRole />
    </>
  );
}
