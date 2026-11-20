"use client";
import Link from "next/link";
import { Camera, Mic, Phone } from "lucide-react";
import { MobileHeader } from "@/components/mobile/mobile-header";
import type { ProjectContext } from "@/lib/db/repo";
import { useApi } from "@/lib/use-api";

export function ChannelView({ teamId }: { teamId: string }) {
  const { data: ctx } = useApi<ProjectContext>("/api/project", { live: false });
  const team = ctx?.teams.find((t) => t.id === teamId);
  return (
    <>
      <MobileHeader title={team?.name ?? "Team"} subtitle={ctx?.project.name} backHref="/app" />
      <main className="flex-1 px-4 py-5">
        <p className="text-sm text-muted-foreground">Noch keine Nachrichten in diesem Kanal.</p>
      </main>
      <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-4">
        <button type="button" className="flex size-12 items-center justify-center rounded-full border border-border" aria-label="Foto aufnehmen">
          <Camera className="size-5" />
        </button>
        <button type="button" className="flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label="Sprachnachricht aufnehmen">
          <Mic className="size-8" />
        </button>
        <Link href={`/app/call/new?team=${teamId}`} className="flex size-12 items-center justify-center rounded-full border border-border" aria-label="Klara anrufen">
          <Phone className="size-5" />
        </Link>
      </footer>
    </>
  );
}
