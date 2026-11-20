"use client";
// /admin/case/[id] (SPEC §8): Dokument, Nachweise, Verlauf, Hinweise + human-in-the-loop actions.
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, CheckCheck, CloudSun, FileDown, FileText, Mail, MessageSquareText, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeadlineBadge, deadlineFromCase } from "@/components/klara/deadline-badge";
import { CheckList, LightDot, overallLight } from "@/components/klara/traffic-light";
import { DOC_TITLES } from "@/lib/doctypes/titles";
import { CASE_STATUS_DE, EVENT_DE, SPHERE_DE, fmtDateTime } from "@/lib/labels";
import type { ProjectContext } from "@/lib/db/repo";
import { useRole } from "@/lib/role";
import type { AppEvent, Case, DocumentVersion, Evidence } from "@/lib/types";
import { postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

type CaseResponse = { case: Case; versions: DocumentVersion[]; evidence: Evidence[]; events: AppEvent[] };

const LOCKED = ["versendet", "beantwortet", "abgeschlossen"];

export function CaseDetail({ id }: { id: string }) {
  const { data, error, reload } = useApi<CaseResponse>(`/api/cases/${id}`);
  const { data: ctx } = useApi<ProjectContext>("/api/project", { live: false });
  const { userId, role } = useRole();
  const [versionId, setVersionId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const c = data?.case;
  const versions = data?.versions ?? [];
  const version = versions.find((v) => v.id === versionId) ?? versions.at(-1) ?? null;
  const deadline = c ? deadlineFromCase(c) : null;
  const hints = useMemo(() => (c ? buildHints(c) : []), [c]);
  const reporter = ctx?.users.find((u) => u.id === c?.created_by);

  const act = async (kind: "validate" | "return") => {
    setBusy(kind);
    try {
      await postJson(`/api/cases/${id}/${kind}`, { user_id: userId });
      toast.success(kind === "validate" ? "Vorgang validiert" : "Zur Ergänzung zurückgegeben");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <main className="p-6">
        <p className="text-sm text-light-red">{error}</p>
      </main>
    );
  }
  if (!c) {
    return (
      <main className="space-y-4 p-6">
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-[600px] w-full" />
      </main>
    );
  }

  const canValidate = c.status === "bereit" && role !== "polier";
  const canReturn = !LOCKED.includes(c.status) && c.status !== "unvollstaendig";
  const canMail = c.status === "validiert";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="border-b border-border bg-background px-6 pt-4 pb-4">
        <Link href="/admin" className="inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="size-4" aria-hidden />
          Vorgänge
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground">{DOC_TITLES[c.doc_type] ?? c.doc_type}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono text-foreground">{c.reference}</span>
              <span aria-hidden className="text-zinc-300">|</span>
              <span>{CASE_STATUS_DE[c.status]}</span>
              {reporter && (
                <>
                  <span aria-hidden className="text-zinc-300">|</span>
                  <span>gemeldet von {reporter.name}</span>
                </>
              )}
              <DeadlineBadge d={deadline} className="ml-1" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {version && (
              <>
                <a
                  href={`${version.docx_url}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FileDown className="size-4" aria-hidden />
                  Word herunterladen
                </a>
                <a
                  href={`${version.pdf_url}?download=1`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FileDown className="size-4" aria-hidden />
                  PDF herunterladen
                </a>
              </>
            )}
            <Button variant="outline" size="lg" className="h-9" disabled={!canReturn || busy !== null} onClick={() => act("return")}>
              <Undo2 aria-hidden />
              Zurück zur Ergänzung
            </Button>
            {canMail ? (
              <Link
                href={`/admin/mail/new?case=${c.id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Mail className="size-4" aria-hidden />
                E-Mail vorbereiten
              </Link>
            ) : (
              <Button size="lg" className="h-9" disabled={!canValidate || busy !== null} onClick={() => act("validate")}>
                <CheckCheck aria-hidden />
                {busy === "validate" ? "Wird validiert…" : "Validieren"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px]">
        {/* Tabs */}
        <Tabs defaultValue="dokument" className="min-w-0 p-6">
          <TabsList variant="line" className="h-9 border-b border-border w-full justify-start rounded-none pb-0">
            <TabsTrigger value="dokument" className="flex-none px-3">Dokument</TabsTrigger>
            <TabsTrigger value="nachweise" className="flex-none px-3">
              Nachweise <span className="font-mono text-xs text-muted-foreground">{data.evidence.length}</span>
            </TabsTrigger>
            <TabsTrigger value="verlauf" className="flex-none px-3">Verlauf</TabsTrigger>
            <TabsTrigger value="hinweise" className="flex-none px-3">
              Hinweise <span className="font-mono text-xs text-muted-foreground">{hints.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dokument" className="pt-4">
            {version ? (
              <div className="flex h-full flex-col gap-3">
                <div className="flex items-center gap-3">
                  <label htmlFor="version" className="text-sm text-muted-foreground">Version</label>
                  <select
                    id="version"
                    value={version.id}
                    onChange={(e) => setVersionId(e.target.value)}
                    className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version} vom {fmtDateTime(v.created_at)}
                        {v.validated_at ? ", validiert" : ""}
                        {v.immutable ? ", versendet" : ""}
                      </option>
                    ))}
                  </select>
                  <span className="font-mono text-xs text-muted-foreground" title="SHA-256 des Schreibens">
                    {version.sha256?.slice(0, 12)}
                  </span>
                  <a
                    href={`${version.pdf_url}?audit=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto rounded text-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Mit interner Prüfseite öffnen
                  </a>
                </div>
                <iframe
                  key={version.id}
                  title={`Vorschau ${c.reference} v${version.version}`}
                  src={`${version.pdf_url}#toolbar=0&view=FitH`}
                  className="min-h-[640px] w-full flex-1 rounded-lg border border-border bg-background"
                />
              </div>
            ) : (
              <EmptyState
                icon={FileText}
                title="Noch kein Dokument"
                text="Das Schreiben wird erzeugt, sobald der Polier die Angaben bestätigt hat."
              />
            )}
          </TabsContent>

          <TabsContent value="nachweise" className="pt-4">
            <EvidenceList evidence={data.evidence} />
          </TabsContent>

          <TabsContent value="verlauf" className="pt-4">
            <Timeline events={data.events} />
          </TabsContent>

          <TabsContent value="hinweise" className="pt-4">
            {hints.length ? (
              <ul className="space-y-2">
                {hints.map((h, i) => (
                  <li key={i} className="flex gap-3 rounded-lg border border-border bg-background p-3 text-sm">
                    <LightDot light={h.light} className="mt-1.5" />
                    <span className="text-foreground">{h.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={CheckCheck} title="Keine Hinweise" text="Alle Prüfungen sind grün." />
            )}
          </TabsContent>
        </Tabs>

        {/* Right panel */}
        <aside className="space-y-6 overflow-auto border-l border-border bg-background p-5" aria-label="Prüfung">
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <LightDot light={overallLight(c.checks)} />
              Prüfungen
            </h2>
            <CheckList checks={c.checks} />
          </section>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-foreground">Angaben</h2>
            <dl className="divide-y divide-border rounded-lg border border-border">
              {factRows(c).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 px-3 py-2 text-sm">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className={cn("text-foreground", v === "fehlt" && "text-muted-foreground italic")}>{v}</dd>
                </div>
              ))}
              {c.sphere && (
                <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 px-3 py-2 text-sm">
                  <dt className="text-muted-foreground">Sphäre</dt>
                  <dd className="text-foreground">{SPHERE_DE[c.sphere]}</dd>
                </div>
              )}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

// ── Parts ─────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  start_at: "Beginn",
  end_at: "Ende",
  resumed_at: "Wiederaufnahme",
  area: "Bereich",
  cause: "Umstände",
  affected_works: "Betroffen",
  idle_staff: "Arbeitskräfte",
  idle_equipment: "Geräte",
  expected_duration: "Dauer",
  instruction_date: "Datum",
  instruction_time: "Uhrzeit",
  instructed_by: "Angeordnet von",
  description: "Leistung",
  instruction_text: "Wortlaut",
  work_started: "Begonnen",
  planned_start: "Beginn geplant",
  estimate_eur: "Schätzung €",
  place: "Ort",
  witnesses: "Anwesend",
};

function factRows(c: Case): [string, string][] {
  const rows: [string, string][] = [];
  for (const [k, label] of Object.entries(FIELD_LABELS)) {
    const v = c.facts[k];
    if (v === undefined || v === null || v === "") {
      if (c.missing_fields.includes(k)) rows.push([label, "fehlt"]);
      continue;
    }
    let s = String(v);
    if (typeof v === "boolean") s = v ? "ja" : "nein";
    else if (/_at$/.test(k) && typeof v === "string") s = `${fmtDateTime(v)} Uhr`;
    rows.push([label, s]);
  }
  return rows;
}

function buildHints(c: Case): { light: "yellow" | "red"; text: string }[] {
  const out: { light: "yellow" | "red"; text: string }[] = [];
  for (const ch of c.checks) if (ch.light !== "green") out.push({ light: ch.light, text: ch.reason_de });
  if (c.flags.includes("escalate")) out.push({ light: "red", text: "Hinweis: Eskalation an die Projektleitung empfohlen." });
  if (c.flags.includes("internal_risk")) out.push({ light: "yellow", text: "Hinweis: internes Risiko – Ursache vermutlich in eigener Sphäre." });
  if (c.doc_type === "stellungnahme_zurueckweisung") {
    out.push({ light: "yellow", text: "Hinweis: Eine Zurückweisung macht die Behinderungsanzeige nicht unwirksam." });
  }
  return out;
}

function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) {
    return <EmptyState icon={MessageSquareText} title="Noch keine Nachweise" text="Gesprächsprotokoll, Wetter und Fotos erscheinen hier." />;
  }
  return (
    <ul className="space-y-3">
      {evidence.map((e) => (
        <li key={e.id} className="rounded-lg border border-border bg-background p-4">
          {e.kind === "transcript" && (
            <>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <MessageSquareText className="size-4 text-muted-foreground" aria-hidden />
                Gesprächsprotokoll
                <span className="font-mono text-xs font-normal text-muted-foreground">{String(e.data.language ?? "").toUpperCase()}</span>
              </h3>
              <ol className="mt-3 space-y-2">
                {((e.data.turns as { role: string; at: string; text: string; text_de: string | null }[]) ?? []).map((t, i) => (
                  <li key={i} className="grid grid-cols-[52px_70px_minmax(0,1fr)] gap-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{fmtDateTime(t.at).slice(-5)}</span>
                    <span className="text-muted-foreground">{t.role === "user" ? "Polier" : "Klara"}</span>
                    <span className="text-foreground">
                      {t.text}
                      {t.text_de && t.text_de !== t.text && <span className="mt-0.5 block text-muted-foreground">DE: {t.text_de}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {e.kind === "weather" && (
            <h3 className="flex items-center gap-2 text-sm text-foreground">
              <CloudSun className="size-4 text-muted-foreground" aria-hidden />
              <span className="font-semibold">Wetter</span>
              <span>{String(e.data.text ?? "")}</span>
            </h3>
          )}
          {!["transcript", "weather"].includes(e.kind) && (
            <p className="text-sm text-foreground">
              {e.kind}: {e.ref}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function Timeline({ events }: { events: AppEvent[] }) {
  if (!events.length) return <EmptyState icon={FileText} title="Noch kein Verlauf" text="Jeder Schritt wird hier protokolliert." />;
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <ol className="relative ml-2 border-l border-border">
      {sorted.map((e) => (
        <li key={e.id} className="relative pb-5 pl-5 last:pb-0">
          <span aria-hidden className="absolute top-1.5 -left-[5px] size-2.5 rounded-full border-2 border-background bg-zinc-400" />
          <p className="text-sm font-medium text-foreground">{EVENT_DE[e.kind] ?? e.kind}</p>
          <p className="font-mono text-xs text-muted-foreground">{fmtDateTime(e.created_at)}</p>
          {eventDetail(e) && <p className="mt-0.5 text-sm text-muted-foreground">{eventDetail(e)}</p>}
        </li>
      ))}
    </ol>
  );
}

function eventDetail(e: AppEvent): string | null {
  const p = e.payload;
  if (e.kind === "document_generated") return `Version ${p.version}`;
  if (e.kind === "case_validated") return `durch ${p.by}, Version ${p.version}`;
  if (e.kind === "returned_for_completion") return `durch ${p.by}${p.note ? `: ${p.note}` : ""}`;
  if (e.kind === "case_confirmed") return `Status: ${CASE_STATUS_DE[p.status as Case["status"]] ?? p.status}`;
  return null;
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof FileText; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border bg-background px-6 py-14 text-center">
      <Icon className="size-6 text-muted-foreground" aria-hidden />
      <p className="mt-3 text-base font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
