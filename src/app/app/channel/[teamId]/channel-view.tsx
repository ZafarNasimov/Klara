"use client";
// Team channel (SPEC §8). M0 shell; the chat with Klara arrives in M1.
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { MobileHeader } from "@/components/mobile/mobile-header";
import type { ProjectContext } from "@/lib/db/repo";
import { useApi } from "@/lib/use-api";

export function ChannelView({ teamId }: { teamId: string }) {
  const { data: ctx } = useApi<ProjectContext>("/api/project", { live: false });
  const team = ctx?.teams.find((t) => t.id === teamId);
  return (
    <>
      <MobileHeader title={team?.name ?? "Team"} subtitle={ctx?.project.name} backHref="/app" backLabel="Zurück zu den Teamkanälen" />
      <main className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <KlaraAvatar size={72} />
        <p className="mt-4 text-base font-medium text-foreground">Was ist auf der Baustelle passiert?</p>
      </main>
    </>
  );
}
