"use client";
// Office case view (SPEC §8 /admin/case/[id]): the letter as it will go out,
// its evidence and history, the checks always in view on the right, and the
// two decisions the Bauleiter makes here: validate, or send it back.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChevronLeft, CloudSun, Download, ExternalLink, FileText, MessagesSquare, Send, Undo2 } from "lucide-react";
import { eventDetail, eventTitle } from "@/components/admin/event-text";
import { formatFact } from "@/components/admin/format-fact";
import { LetterPreview } from "@/components/documents/letter-preview";
import { DeadlineBadge } from "@/components/klara/deadline-badge";
import { CheckList, LightDot } from "@/components/klara/traffic-light";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectContext } from "@/lib/db/repo";
import { docTitle, getDocType, hasValue } from "@/lib/doctypes";
import type { DocBody } from "@/lib/documents/types";
import { CASE_STATUS_DE, fmtDateTime, fmtShort, fmtTime, SPHERE_DE } from "@/lib/labels";
import { useRole } from "@/lib/role";
import type { CaseDetail, CaseView, DocumentVersion, Evidence } from "@/lib/types";
import { ApiError, postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

type ProjectResponse = ProjectContext & { now: string };

const FLAG_DE: Record<string, string> = {
  escalate: "Ankündigung vor Ausführung versäumt – Bauleitung einbinden",
  internal_risk: "Interner Risikohinweis: Ursache vermutlich in der eigenen Sphäre",
  no_cost_reservation: "Witterung: nur Bauzeitverlängerung, kein Kostenvorbehalt",
  returned: "Zur Ergänzung beim Polier",
  correcting: "Der Polier korrigiert die Meldung gerade",
};

export function CaseDetailView({ id }: { id: string }) {
  const { data, error, reload } = useApi<CaseDetail>(`/api/cases/${id}`);
  const { data: ctx } = useApi<ProjectResponse>("/api/project");
  const user = useRole();
  const [versionId, setVersionId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"validate" | "return" | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);

  if (error && !data) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-base font-medium text-foreground">Der Vorgang konnte nicht geladen werden.</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" onClick={reload}>
            Erneut laden
          </Button>
          <Link href="/admin" className={buttonVariants({ variant: "ghost" })}>
            Zur Übersicht
          </Link>
        </div>
      </main>
    );
  }
  if (!data) return <DetailSkeleton />;

  const c = data.case;
  const def = getDocType(c.doc_type);
  const version = data.versions.find((v) => v.id === versionId) ?? data.versions[0] ?? null;
  const latest = data.versions[0] ?? null;
  const name = (uid: string | null) => ctx?.users.find((u) => u.id === uid)?.name ?? null;
  const returned = c.flags.includes("returned");
  const correcting = c.flags.includes("correcting");
  const isBauleiter = user.role === "bauleiter";
  const canValidate = c.status !== "validiert" && !data.validation_blocker && isBauleiter && !!latest;
  const validateHint =
    c.status === "validiert"
      ? null
      : data.validation_blocker ?? (!isBauleiter ? "Validieren kann nur die Bauleitung (Rolle oben rechts wechseln)." : null);

  const validate = async () => {
    setBusy("validate");
    try {
      await postJson(`/api/cases/${c.id}/validate`, { user_id: user.userId });
      toast.success(`${c.reference} validiert`);
      setVersionId(null);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError && e.status < 500 ? e.message : "Validieren hat nicht geklappt. Bitte erneut versuchen.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px]">
      <main className="min-h-0 overflow-y-auto">
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="border-b border-border bg-background px-8 pt-4 pb-5">
          <Link
            href="/admin"
            className="-ml-2 inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Vorgänge
          </Link>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-8 gap-y-4">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{docTitle(c.doc_type)}</h1>
              {def ? <p className="mt-0.5 text-sm text-muted-foreground">{def.legal_basis}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className="font-mono text-foreground">{c.reference}</span>
                <span className="text-muted-foreground">
                  {c.team_name ?? "Ohne Team"}
                  {c.author_name ? `, gemeldet von ${c.author_name}` : null}
                </span>
                <span className="inline-flex h-7 items-center rounded-md border border-border px-2 text-foreground">
                  {returned ? "Zur Ergänzung beim Polier" : correcting ? "Korrektur beim Polier" : CASE_STATUS_DE[c.status]}
                </span>
                <DeadlineBadge d={c.deadline} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="lg" disabled={returnOpen || c.status === "versendet"} onClick={() => setReturnOpen(true)}>
                  <Undo2 aria-hidden />
                  Zurück zur Ergänzung
                </Button>
                {c.status === "validiert" ? (
                  <Link href={`/admin/mail/new?case=${c.id}`} className={buttonVariants({ size: "lg" })}>
                    <Send aria-hidden />
                    E-Mail vorbereiten
                  </Link>
                ) : (
                  <Button size="lg" disabled={!canValidate || busy === "validate"} onClick={() => void validate()}>
                    {busy === "validate" ? "Wird validiert …" : "Validieren"}
                  </Button>
                )}
              </div>
              {validateHint ? <p className="max-w-[420px] text-right text-sm text-muted-foreground">{validateHint}</p> : null}
              {c.status === "validiert" && latest?.validated_at ? (
                <p className="text-right text-sm text-muted-foreground">
                  Validiert von {name(latest.validated_by) ?? "der Bauleitung"},{" "}
                  <time dateTime={latest.validated_at} className="font-mono">
                    {fmtDateTime(latest.validated_at)}
                  </time>
                </p>
              ) : null}
            </div>
          </div>
        </header>

        {/* ── Tabs ───────────────────────────────────────────────── */}
        <Tabs defaultValue="dokument" className="px-8 pt-4 pb-10">
          <TabsList variant="line" className="h-10 border-b border-border">
            <TabsTrigger value="dokument" className="px-3">
              Dokument
            </TabsTrigger>
            <TabsTrigger value="nachweise" className="px-3">
              Nachweise <Count n={data.evidence.length} />
            </TabsTrigger>
            <TabsTrigger value="verlauf" className="px-3">
              Verlauf
            </TabsTrigger>
            <TabsTrigger value="hinweise" className="px-3">
              Hinweise
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dokument" className="pt-5">
            {version ? (
              <>
                <VersionBar versions={data.versions} current={version} onPick={setVersionId} validatedBy={name(version.validated_by)} />
                <LetterPreview body={version.body as DocBody} className="mt-5" />
              </>
            ) : (
              <Empty icon={<FileText className="size-5" aria-hidden />} title="Noch kein Schreiben">
                {def ? "Das Schreiben entsteht, sobald der Polier die Meldung bestätigt." : "Für diesen Dokumenttyp gibt es noch keine Vorlage."}
              </Empty>
            )}
          </TabsContent>

          <TabsContent value="nachweise" className="pt-5">
            <EvidenceList evidence={data.evidence} author={c.author_name} />
          </TabsContent>

          <TabsContent value="verlauf" className="pt-5">
            <Timeline events={data.events} />
          </TabsContent>

          <TabsContent value="hinweise" className="pt-5">
            <Notes c={c} parent={data.parent} linked={data.children} />
          </TabsContent>
        </Tabs>
      </main>

      {/* ── Right rail: checks and facts ─────────────────────────── */}
      <aside aria-label="Prüfungen und Angaben" className="min-h-0 overflow-y-auto border-l border-border bg-background px-5 py-5">
        <h2 className="text-sm font-medium text-foreground">Prüfungen</h2>
        <CheckList checks={c.checks} className="mt-1" />
        <Facts c={c} />
      </aside>

      <ReturnDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        c={c}
        fields={data.askable_fields}
        busy={busy === "return"}
        onSubmit={async (field, note) => {
          setBusy("return");
          try {
            await postJson(`/api/cases/${c.id}/return`, { field, note_de: note, user_id: user.userId });
            toast.success(`Frage an ${c.team_name ?? "den Polier"} gesendet`);
            setReturnOpen(false);
            reload();
          } catch (e) {
            toast.error(e instanceof ApiError && e.status < 500 ? e.message : "Senden hat nicht geklappt. Bitte erneut versuchen.");
          } finally {
            setBusy(null);
          }
        }}
      />
    </div>
  );
}

function Count({ n }: { n: number }) {
  return n ? <span className="font-mono text-xs text-muted-foreground">{n}</span> : null;
}

// ── Dokument ──────────────────────────────────────────────────────────

function VersionBar({
  versions,
  current,
  onPick,
  validatedBy,
}: {
  versions: DocumentVersion[];
  current: DocumentVersion;
  onPick: (id: string) => void;
  validatedBy: string | null;
}) {
  return (
    <div className="mx-auto flex max-w-[720px] flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {versions.length > 1 ? (
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Version</span>
            <select
              value={current.id}
              onChange={(e) => onPick(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 font-mono text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.version} vom {fmtShort(v.created_at)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="text-foreground">
            Version <span className="font-mono">{current.version}</span>
          </span>
        )}
        <span className="text-muted-foreground">
          erstellt <span className="font-mono">{fmtDateTime(current.created_at)}</span>
        </span>
        {current.sha256 ? (
          <span className="text-muted-foreground" title={current.sha256}>
            SHA-256 <span className="font-mono">{current.sha256.slice(0, 12)}…</span>
          </span>
        ) : null}
        {current.validated_at ? <span className="text-foreground">validiert von {validatedBy ?? "der Bauleitung"}</span> : null}
      </div>
      <div className="flex items-center gap-1">
        <a href={`/api/documents/${current.id}/pdf`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost" })}>
          <ExternalLink aria-hidden />
          PDF öffnen
        </a>
        <a href={`/api/documents/${current.id}/pdf?download=1`} className={buttonVariants({ variant: "outline" })}>
          <Download aria-hidden />
          PDF herunterladen
        </a>
        <a href={`/api/documents/${current.id}/docx`} className={buttonVariants({ variant: "outline" })}>
          <Download aria-hidden />
          Word herunterladen
        </a>
      </div>
    </div>
  );
}

// ── Nachweise ─────────────────────────────────────────────────────────

type TranscriptTurn = { role: "user" | "klara"; text: string; text_de: string | null; language: string | null; at: string };

function EvidenceList({ evidence, author }: { evidence: Evidence[]; author: string | null }) {
  if (!evidence.length) {
    return (
      <Empty icon={<MessagesSquare className="size-5" aria-hidden />} title="Noch keine Nachweise">
        Gesprächsprotokoll und Wetterdaten werden beim Bestätigen durch den Polier angehängt.
      </Empty>
    );
  }
  const order = { transcript: 0, weather: 1, photo: 2, diary: 3, email: 4, meeting: 5 } as const;
  return (
    <div className="max-w-[760px] space-y-4">
      {[...evidence]
        .sort((a, b) => order[a.kind] - order[b.kind])
        .map((e) =>
          e.kind === "transcript" ? (
            <Transcript key={e.id} e={e} author={author} />
          ) : e.kind === "weather" ? (
            <Weather key={e.id} e={e} />
          ) : (
            <Section key={e.id} title={EVIDENCE_DE[e.kind]} at={e.created_at}>
              <p className="text-sm text-foreground">{typeof e.data.summary_de === "string" ? e.data.summary_de : "Ohne Beschreibung"}</p>
            </Section>
          ),
        )}
    </div>
  );
}

const EVIDENCE_DE: Record<Evidence["kind"], string> = {
  transcript: "Gesprächsprotokoll",
  weather: "Wetterdaten",
  photo: "Foto",
  diary: "Bautagebuch",
  email: "E-Mail",
  meeting: "Besprechung",
};

function Section({ title, at, icon, children }: { title: string; at?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-background">
      <h3 className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-medium text-foreground">
        {icon}
        {title}
        {at ? (
          <time dateTime={at} className="ml-auto font-mono text-xs font-normal text-muted-foreground">
            {fmtDateTime(at)}
          </time>
        ) : null}
      </h3>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function Transcript({ e, author }: { e: Evidence; author: string | null }) {
  const turns = Array.isArray(e.data.turns) ? (e.data.turns as TranscriptTurn[]) : [];
  const via = e.data.kind === "call" ? "Anruf" : "Chat";
  return (
    <Section title={`Gesprächsprotokoll (${via})`} at={e.created_at} icon={<MessagesSquare className="size-4 text-muted-foreground" aria-hidden />}>
      <ol className="space-y-3">
        {turns.map((t, i) => (
          <li key={i} className="grid grid-cols-[48px_128px_minmax(0,1fr)] gap-3 text-sm">
            <time dateTime={t.at} className="pt-px font-mono text-xs text-muted-foreground">
              {fmtTime(t.at)}
            </time>
            <span className={cn("font-medium", t.role === "klara" ? "text-muted-foreground" : "text-foreground")}>
              {t.role === "klara" ? "Klara" : (author ?? "Polier")}
            </span>
            <div className="min-w-0">
              <p lang={t.language ?? undefined} className="text-foreground">
                {t.text}
              </p>
              {t.text_de && t.text_de !== t.text ? (
                <p lang="de" className="mt-0.5 text-muted-foreground">
                  {t.text_de}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Weather({ e }: { e: Evidence }) {
  const d = e.data as { summary_de?: string; unusual?: string[]; at?: string };
  return (
    <Section title="Wetterdaten am Ort" at={e.created_at} icon={<CloudSun className="size-4 text-muted-foreground" aria-hidden />}>
      <p className="text-sm text-foreground">{d.summary_de}</p>
      {d.unusual?.length ? (
        <p className="mt-1 text-sm text-muted-foreground">Ungewöhnlich: {d.unusual.join(", ")}</p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Keine ungewöhnliche Witterung erkannt.</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Quelle: Open-Meteo, Wettermodell für den Standort der Baustelle zur Ereigniszeit.</p>
    </Section>
  );
}

// ── Verlauf ───────────────────────────────────────────────────────────

function Timeline({ events }: { events: CaseDetail["events"] }) {
  const shown = events.filter((e) => eventTitle(e)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!shown.length) return <Empty title="Noch kein Verlauf">Ereignisse zu diesem Vorgang erscheinen hier.</Empty>;
  return (
    <ol className="max-w-[760px] divide-y divide-border rounded-xl border border-border bg-background">
      {shown.map((e) => (
        <li key={e.id} className="grid grid-cols-[148px_minmax(0,1fr)] gap-4 px-4 py-3 text-sm">
          <time dateTime={e.created_at} className="font-mono text-xs leading-5 text-muted-foreground">
            {fmtDateTime(e.created_at)}
          </time>
          <div className="min-w-0">
            <p className="text-foreground">
              {eventTitle(e)}
              {typeof e.payload.by === "string" && e.payload.by ? <span className="text-muted-foreground">, {e.payload.by}</span> : null}
            </p>
            {eventDetail(e) ? <p className="text-muted-foreground">{eventDetail(e)}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Hinweise ──────────────────────────────────────────────────────────

function Notes({ c, parent, linked }: { c: CaseView; parent: CaseView | null; linked: CaseView[] }) {
  const def = getDocType(c.doc_type);
  const flags = c.flags.map((f) => FLAG_DE[f]).filter(Boolean);
  const rows: { label: string; value: ReactNode }[] = [
    ...(def ? [{ label: "Rechtsgrundlage", value: def.legal_basis }] : []),
    ...(def?.when_de ? [{ label: "Anwendungsfall", value: def.when_de }] : []),
    ...(c.sphere ? [{ label: "Sphäre", value: SPHERE_DE[c.sphere] }] : []),
    ...(c.deadline ? [{ label: "Frist", value: c.deadline.label_de }] : []),
    ...(flags.length ? [{ label: "Interne Hinweise", value: <ul className="space-y-1">{flags.map((f) => <li key={f}>{f}</li>)}</ul> }] : []),
    ...(parent || linked.length
      ? [
          {
            label: "Verknüpft",
            value: (
              <ul className="space-y-1">
                {[...(parent ? [parent] : []), ...linked].map((x) => (
                  <li key={x.id}>
                    <Link href={`/admin/case/${x.id}`} className="text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="font-mono">{x.reference}</span> {docTitle(x.doc_type)}
                    </Link>
                  </li>
                ))}
              </ul>
            ),
          },
        ]
      : []),
    { label: "Textbausteine", value: "Prototyp: die Vorlagentexte vor dem Echtbetrieb juristisch prüfen lassen." },
  ];
  return (
    <dl className="max-w-[760px] divide-y divide-border rounded-xl border border-border bg-background">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[148px_minmax(0,1fr)] gap-4 px-4 py-3 text-sm">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="text-foreground">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Right rail ────────────────────────────────────────────────────────

function Facts({ c }: { c: CaseView }) {
  const def = getDocType(c.doc_type);
  if (!def) return null;
  const inferred = Array.isArray(c.facts._inferred) ? (c.facts._inferred as string[]) : [];
  const shown = def.fields.filter((f) => hasValue(c.facts[f.key]) || c.missing_fields.includes(f.key));
  return (
    <>
      <h2 className="mt-6 text-sm font-medium text-foreground">Angaben</h2>
      <dl className="mt-1 divide-y divide-border">
        {shown.map((f) =>
          c.missing_fields.includes(f.key) ? (
            <div key={f.key} className="flex items-start gap-2 py-2">
              <LightDot light="yellow" className="mt-1.5" />
              <div>
                <dt className="text-xs text-muted-foreground">{f.label_de}</dt>
                <dd className="text-sm text-light-yellow-text">fehlt</dd>
              </div>
            </div>
          ) : (
            <div key={f.key} className="py-2">
              <dt className="text-xs text-muted-foreground">
                {f.label_de}
                {inferred.includes(f.key) ? <span> (aus dem Bauzeitenplan abgeleitet)</span> : null}
              </dt>
              <dd className={cn("text-sm text-foreground", (f.type === "number" || f.type === "datetime" || f.type === "date") && "font-mono")}>
                {formatFact(f.type, c.facts[f.key])}
              </dd>
            </div>
          ),
        )}
      </dl>
    </>
  );
}

// ── Zurück zur Ergänzung ──────────────────────────────────────────────

function ReturnDialog({
  open,
  onOpenChange,
  c,
  fields,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  c: CaseView;
  fields: CaseDetail["askable_fields"];
  busy: boolean;
  onSubmit: (field: string | null, note: string | null) => Promise<void>;
}) {
  // Preselect only a field that is actually missing; otherwise the office writes what it needs.
  const [field, setField] = useState<string | null>(fields.find((f) => f.missing)?.key ?? null);
  const [note, setNote] = useState("");
  const ready = !!field || !!note.trim();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) void onSubmit(field, note.trim() || null);
          }}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>Zurück zur Ergänzung</DialogTitle>
            <DialogDescription>
              Klara fragt {c.author_name ?? "den Polier"} im Teamkanal, in der eigenen Sprache. Die Antwort ergänzt {c.reference}, danach wird erneut bestätigt.
            </DialogDescription>
          </DialogHeader>
          <fieldset>
            <legend className="text-sm font-medium text-foreground">Welche Angabe?</legend>
            <div className="mt-2 max-h-80 space-y-0.5 overflow-y-auto">
              {fields.map((f) => (
                <label key={f.key} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-muted">
                  <input type="radio" name="field" value={f.key} checked={field === f.key} onChange={() => setField(f.key)} className="size-4 accent-primary" />
                  <span className="flex-1 text-foreground">{f.label}</span>
                  {f.missing ? <span className="text-xs text-light-yellow-text">fehlt</span> : null}
                </label>
              ))}
              <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-muted">
                <input type="radio" name="field" value="" checked={field === null} onChange={() => setField(null)} className="size-4 accent-primary" />
                <span className="flex-1 text-foreground">Nur meine Nachricht</span>
              </label>
            </div>
          </fieldset>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-foreground">Nachricht an den Polier{field ? " (optional)" : null}</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="z. B. Bitte die Bagger-Stillstandszeit mit angeben." />
            <span className="text-xs text-muted-foreground">Auf Deutsch schreiben; Klara übersetzt.</span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={!ready || busy}>
              {busy ? "Wird gesendet …" : "An den Polier senden"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── States ────────────────────────────────────────────────────────────

function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-14 text-center">
      {icon ? <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</span> : null}
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4 px-8 py-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-80" />
        <Skeleton className="h-5 w-[28rem]" />
        <Skeleton className="mx-auto mt-10 aspect-[210/297] w-full max-w-[720px]" />
      </div>
      <div className="space-y-3 border-l border-border bg-background px-5 py-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
