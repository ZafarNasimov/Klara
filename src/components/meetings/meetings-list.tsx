"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Mic, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectContext } from "@/lib/db/repo";
import { fmtDate, ROLE_DE } from "@/lib/labels";
import { defaultTitle, fmtClock, MEETING_TYPE_DE, MEETING_TYPES, outcomeChips, type MeetingType, type MeetingView, type Participant } from "@/lib/meetings/model";
import { useProjectId } from "@/lib/project-choice";
import { ApiError, postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { $t, $tx } from "@/lib/i18n";
import { localized } from "@/lib/labels";

type ProjectResponse = ProjectContext & { now: string };

/** "Besprechungen" tab: the project's meetings and "Meeting starten". */
export function MeetingsList() {
  // The site chosen in the office (top bar / Vorgänge), like the case board.
  const [projectId] = useProjectId();
  const { data: meetings, error } = useApi<MeetingView[]>(`/api/meetings?project=${projectId}`);
  const { data: ctx } = useApi<ProjectResponse>(`/api/project?id=${projectId}`);
  const [starting, setStarting] = useState(false);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{$t("Besprechungen")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ctx ? `${ctx.project.name} · ` : ""}
            {$t("Klara hört mit, schreibt das Protokoll und füllt nur die Vorlagen, für die es einen Beleg im Gespräch gibt.")}
          </p>
        </div>
        <Button size="lg" onClick={() => setStarting(true)} disabled={!ctx}>
          <Mic aria-hidden /> Meeting starten
        </Button>
      </header>

      <section aria-label={$t("Besprechungen")} className="mt-6">
        {error ? (
          <p className="rounded-xl border border-border bg-background px-5 py-4 text-sm text-foreground">Besprechungen konnten nicht geladen werden: {error}</p>
        ) : !meetings ? (
          <div className="space-y-2">
            <Skeleton className="h-[72px] w-full" />
            <Skeleton className="h-[72px] w-full" />
          </div>
        ) : meetings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background px-5 py-8 text-center">
            <p className="text-sm font-medium text-foreground">{$t("Noch keine Besprechung aufgenommen.")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{$t("Starten Sie die nächste Baubesprechung hier; Klara erstellt danach Protokoll, Aufgaben und Entwürfe.")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
            {meetings.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/admin/meetings/${m.id}`}
                  className="flex items-center gap-4 px-5 py-4 outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2 text-sm font-medium text-foreground">
                      <span className="font-mono text-xs text-muted-foreground">{m.ref}</span>
                      <span className="truncate">{m.title}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {MEETING_TYPE_DE[m.type]} · {fmtDate(m.started_at)} · <span className="font-mono">{fmtClock(m.duration_sec)}</span>
                      {m.status !== "ready" ? <span className="ml-1 text-foreground"> · {STATUS_DE[m.status]}</span> : null}
                    </p>
                    {m.status === "ready" ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={$t("Ergebnis")}>
                        {outcomeChips(m).map((c) => (
                          <li key={c} className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-foreground">
                            {$tx(c)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {ctx ? <StartMeetingDialog open={starting} onOpenChange={setStarting} ctx={ctx} /> : null}
    </main>
  );
}

const STATUS_DE = localized({ recording: "Aufnahme läuft", processing: "wird ausgewertet", ready: "fertig", failed: "Auswertung fehlgeschlagen" });

function candidates(ctx: ProjectResponse): (Participant & { key: string })[] {
  const own = ctx.users
    .filter((u) => u.role === "bauleiter" || u.role === "buero" || u.role === "polier")
    .map((u) => ({ key: `u-${u.id}`, name: u.name, role: `${USER_ROLE_DE[u.role] ?? u.role} (${ctx.company.name})`, contact_id: null, email: u.email }));
  const contacts = ctx.contacts.map((c) => ({ key: `c-${c.id}`, name: c.name, role: `${ROLE_DE[c.role] ?? c.role} (${c.organisation})`, contact_id: c.id, email: c.email || null }));
  return [...own, ...contacts];
}

const USER_ROLE_DE: Record<string, string> = { polier: "Polier", bauleiter: "Bauleiter", buero: "Büro", gf: "Geschäftsführung" };

function StartMeetingDialog({ open, onOpenChange, ctx }: { open: boolean; onOpenChange: (v: boolean) => void; ctx: ProjectResponse }) {
  const router = useRouter();
  const people = candidates(ctx);
  const [title, setTitle] = useState(() => defaultTitle(new Date(ctx.now)));
  const [type, setType] = useState<MeetingType>("bauherr");
  const [team, setTeam] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(people.filter((p) => p.role.startsWith("Bauleiter")).map((p) => p.key)));
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const m = await postJson<MeetingView>("/api/meetings", {
        project: ctx.project.id,
        title,
        type,
        team_id: type === "intern" ? team : null,
        participants: people.filter((p) => picked.has(p.key)).map((p) => ({ name: p.name, role: p.role, contact_id: p.contact_id, email: p.email })),
        consent,
      });
      router.push(`/admin/meetings/${m.id}?start=1`);
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? $tx(e.message) : $t("Die Besprechung konnte nicht gestartet werden."));
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{$t("Meeting starten")}</DialogTitle>
          <DialogDescription>{$t("Klara nimmt die Besprechung auf und wertet sie danach aus.")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">{$t("Titel")}</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-foreground">Art</legend>
            <div role="radiogroup" className="inline-flex rounded-lg border border-border bg-background p-0.5">
              {MEETING_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  onClick={() => setType(t)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    type === t ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {MEETING_TYPE_DE[t]}
                </button>
              ))}
            </div>
          </fieldset>

          {type === "intern" ? (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-foreground">{$t("Team (optional)")}</legend>
              <div className="flex flex-wrap gap-1.5">
                {[{ id: null, name: "Kein Team" }, ...ctx.teams].map((t) => (
                  <button
                    key={t.id ?? "none"}
                    type="button"
                    aria-pressed={team === t.id}
                    onClick={() => setTeam(t.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      team === t.id ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.id ? <Users className="size-3.5" aria-hidden /> : null}
                    {t.name}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-foreground">{$t("Teilnehmer")}</legend>
            <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1.5">
              {people.map((p) => (
                <li key={p.key}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <input type="checkbox" className="size-4 accent-primary" checked={picked.has(p.key)} onChange={() => toggle(p.key)} />
                    <span className="text-foreground">{p.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{p.role}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="text-foreground">{$t("Alle Teilnehmer sind mit der Aufnahme einverstanden.")}</span>
          </label>

          {error ? <p className="text-sm text-light-red-text" role="alert">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {$t("Abbrechen")}
          </Button>
          <Button onClick={start} disabled={!consent || !title.trim() || busy} title={!consent ? $t("Ohne Einverständnis aller Teilnehmer keine Aufnahme") : undefined}>
            <Mic aria-hidden /> Aufnahme starten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
