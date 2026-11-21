"use client";
// Office case view (SPEC §8 /admin/case/[id]): the letter as it will go out,
// its evidence and history, the checks always in view on the right, and the
// two decisions the Bauleiter makes here: validate, or send it back.
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { Camera, ChevronLeft, CloudSun, Download, ExternalLink, FileText, Mail, MessagesSquare, Send, Undo2 } from "lucide-react";
import { eventDetail, eventTitle } from "@/components/admin/event-text";
import { formatFact } from "@/components/admin/format-fact";
import { LetterPreview } from "@/components/documents/letter-preview";
import { DeadlineBadge } from "@/components/klara/deadline-badge";
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { CheckList, LightDot } from "@/components/klara/traffic-light";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectContext } from "@/lib/db/repo";
import { docTitle, getDocType, hasValue } from "@/lib/doctypes";
import type { DocBody } from "@/lib/documents/types";
import { CASE_STATUS_DE, fmtDate, fmtDateTime, fmtShort, fmtTime, REPLY_KIND_DE, ROLE_GENITIVE_DE, SPHERE_DE } from "@/lib/labels";
import { useProjectId } from "@/lib/project-choice";
import { useRole } from "@/lib/role";
import type { CaseDetail, CaseStatus, CaseView, DocumentVersion, EmailIn, EmailOut, Evidence, ReplyClassification } from "@/lib/types";
import { ApiError, postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

type ProjectResponse = ProjectContext & { now: string; mail?: MailMode };
type MailMode = "smtp" | "postmark" | "simulated";

const SENT = new Set<CaseStatus>(["versendet", "beantwortet", "abgeschlossen"]);

const FLAG_DE: Record<string, string> = {
  escalate: "Ankündigung vor Ausführung versäumt – Bauleitung einbinden",
  internal_risk: "Interner Risikohinweis: Ursache vermutlich in der eigenen Sphäre",
  no_cost_reservation: "Witterung: nur Bauzeitverlängerung, kein Kostenvorbehalt",
  returned: "Zur Ergänzung beim Polier",
  correcting: "Der Polier korrigiert die Meldung gerade",
  collecting: "Klara fragt den Polier im Chat noch nach",
};

export function CaseDetailView({ id }: { id: string }) {
  const { data, error, reload } = useApi<CaseDetail>(`/api/cases/${id}`);
  const projectOfCase = data?.case.project_id ?? null;
  const { data: ctx } = useApi<ProjectResponse>(projectOfCase ? `/api/project?id=${projectOfCase}` : null);
  const [, setProjectId] = useProjectId();
  useEffect(() => {
    if (projectOfCase) setProjectId(projectOfCase);
  }, [projectOfCase, setProjectId]);
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
  const collecting = c.flags.includes("collecting");
  const isBauleiter = user.role === "bauleiter";
  const sentMail = data.emails.find((m) => m.status !== "entwurf") ?? null;
  const sent = SENT.has(c.status);
  const canValidate = c.status !== "validiert" && !data.validation_blocker && isBauleiter && !!latest;
  const validateHint =
    c.status === "validiert" || SENT.has(c.status)
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
                  {c.team_name ? (
                    <>
                      {c.team_name}
                      {c.author_name ? `, gemeldet von ${c.author_name}` : null}
                    </>
                  ) : data.parent ? (
                    <>
                      Folgeschreiben zu{" "}
                      <Link
                        href={`/admin/case/${data.parent.id}`}
                        className="font-mono text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {data.parent.reference}
                      </Link>
                    </>
                  ) : (
                    "Ohne Team"
                  )}
                </span>
                <span className="inline-flex h-7 items-center rounded-md border border-border px-2 text-foreground">
                  {returned ? "Zur Ergänzung beim Polier" : correcting ? "Korrektur beim Polier" : collecting ? "Klara fragt nach" : CASE_STATUS_DE[c.status]}
                </span>
                <DeadlineBadge d={c.deadline} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap justify-end gap-2">
                {sent ? (
                  sentMail ? (
                    <Link href={`/admin/mail/${sentMail.id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
                      <Mail aria-hidden />
                      E-Mail ansehen
                    </Link>
                  ) : null
                ) : !c.team_id ? null : (
                  <Button variant="outline" size="lg" disabled={returnOpen} onClick={() => setReturnOpen(true)}>
                    <Undo2 aria-hidden />
                    Zurück zur Ergänzung
                  </Button>
                )}
                {!sent && c.status === "bereit" && def && def.recipient !== "internal" && latest ? (
                  <Link href={`/admin/mail/new?case=${c.id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
                    <Send aria-hidden />
                    E-Mail vorbereiten
                  </Link>
                ) : null}
                {sent ? null : c.status === "validiert" ? (
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

        {!sentMail && typeof c.facts._hint_de === "string" && data.parent ? (
          <div className="px-8 pt-5">
            <FollowupNote c={c} parent={data.parent} now={ctx?.now ?? null} />
          </div>
        ) : null}

        {sentMail ? (
          <div className="px-8 pt-5">
            <MailStatus mail={sentMail} data={data} contacts={ctx?.contacts ?? []} now={ctx?.now ?? null} mode={ctx?.mail ?? null} onChange={reload} />
          </div>
        ) : null}

        {/* ── Tabs ───────────────────────────────────────────────── */}
        <Tabs defaultValue="dokument" className="px-8 pt-4 pb-10">
          <TabsList variant="line" className="h-10 border-b border-border">
            <TabsTrigger value="dokument" className="px-3">
              Dokument
            </TabsTrigger>
            <TabsTrigger value="nachweise" className="px-3">
              Nachweise <Count n={data.evidence.length + (data.live_transcript ? 1 : 0)} />
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
            <EvidenceList evidence={data.evidence} live={data.live_transcript} author={c.author_name} />
          </TabsContent>

          <TabsContent value="verlauf" className="pt-5">
            <Timeline events={data.chain_events} chain={data.chain} current={c.id} />
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

// ── E-Mail und Antwort ────────────────────────────────────────────────

type Contacts = ProjectContext["contacts"];

/** Waiting for the client, or the client's answer with Klara's proposal (SPEC §6.4 step 5). */
function MailStatus({
  mail,
  data,
  contacts,
  now,
  mode,
  onChange,
}: {
  mail: EmailOut;
  data: CaseDetail;
  contacts: Contacts;
  now: string | null;
  mode: MailMode | null;
  onChange: () => void;
}) {
  const reduce = useReducedMotion();
  const reply = data.replies[0] ?? null;
  const cardRef = useRef<HTMLDivElement>(null);
  const seen = useRef<string | null | undefined>(undefined);
  // A reply that arrives while the page is open is announced and scrolled into view; one that was already there is not.
  useEffect(() => {
    const id = reply?.id ?? null;
    if (seen.current !== undefined && id && id !== seen.current && reply) {
      const sender = contacts.find((x) => x.email?.toLowerCase() === reply.from_addr.toLowerCase());
      const kind = (reply.classification as ReplyClassification | null)?.kind ?? "other";
      toast(`Antwort von ${sender?.name ?? reply.from_addr} eingegangen: ${REPLY_KIND_DE[kind]}`);
      cardRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }
    seen.current = id;
  }, [reply, contacts, reduce]);
  return (
    <div ref={cardRef} className="max-w-[760px] scroll-mt-4">
      {/* The answer arrives by itself (realtime); its card fades in where the waiting note was. */}
      <AnimatePresence initial={false}>
        {reply ? (
          <motion.div
            key={reply.id}
            initial={{ opacity: 0, y: reduce ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            <ReplyCard reply={reply} data={data} contacts={contacts} now={now} />
          </motion.div>
        ) : (
          <Waiting key="waiting" mail={mail} caseId={data.case.id} contacts={contacts} now={now} mode={mode} onChange={onChange} />
        )}
      </AnimatePresence>
    </div>
  );
}

const contactName = (email: string, contacts: Contacts) => {
  const k = contacts.find((x) => x.email?.toLowerCase() === email.toLowerCase());
  return k ? `${k.name} (${k.organisation})` : email;
};

/**
 * SPEC §1 fallback: if the client's answer has not arrived, the demo can play it in.
 * 15 s for a test send; with a real mailbox a person has to write the answer, so 60 s.
 */
const SIMULATE_AFTER_MS = { real: 60_000, test: 15_000 };
/** How often the page asks the server to read the mailbox (SMTP/IMAP mode). */
const INBOX_POLL_MS = 10_000;

function Waiting({
  mail,
  caseId,
  contacts,
  now,
  mode,
  onChange,
}: {
  mail: EmailOut;
  caseId: string;
  contacts: Contacts;
  now: string | null;
  mode: MailMode | null;
  onChange: () => void;
}) {
  const simulated = mail.message_id?.startsWith("sim-") ?? false;
  const polling = mode === "smtp" && !simulated;
  const simulateAfter = polling ? SIMULATE_AFTER_MS.real : SIMULATE_AFTER_MS.test;
  const sentAgo = now && mail.sent_at ? Date.parse(now) - Date.parse(mail.sent_at) : 0;
  const [late, setLate] = useState(sentAgo >= simulateAfter);
  const [busy, setBusy] = useState(false);
  const [lastCheck, setLastCheck] = useState<{ at: Date; error: string | null } | null>(null);
  useEffect(() => {
    if (late) return;
    const t = setTimeout(() => setLate(true), Math.max(0, simulateAfter - sentAgo));
    return () => clearTimeout(t);
  }, [late, sentAgo, simulateAfter]);

  // Real mailbox: read it every 10 s while this panel is open; a matched answer reloads the case.
  const [checkNonce, setCheckNonce] = useState(0);
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    const check = async () => {
      try {
        const r = await postJson<{ received: { case_id: string | null }[] }>("/api/email/poll", {});
        if (stopped) return;
        setLastCheck({ at: new Date(), error: null });
        if (r.received.some((x) => x.case_id === caseId)) onChange();
      } catch (e) {
        if (!stopped) setLastCheck({ at: new Date(), error: e instanceof ApiError && e.status < 500 ? e.message : e instanceof Error ? e.message : "Postfach nicht erreichbar" });
      }
    };
    void check();
    const t = setInterval(() => void check(), INBOX_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [polling, caseId, onChange, checkNonce]);

  const simulate = async () => {
    setBusy(true);
    try {
      await postJson("/api/demo/reply", { case_id: caseId });
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError && e.status < 500 ? e.message : "Die Antwort konnte nicht eingespielt werden.");
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="waiting-h" className="rounded-xl border border-border bg-background px-5 py-4">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h2 id="waiting-h" className="text-sm font-medium text-foreground">
            Wartet auf Antwort
          </h2>
          {/* Text that changes sits in its own elements: a translated page (browser translation
              replaces text nodes) must not lose the anchors React inserts next to. */}
          <p className="mt-0.5 text-sm text-muted-foreground">
            {mail.sent_at ? (
              <span>
                Versendet am{" "}
                <time dateTime={mail.sent_at} className="font-mono">
                  {fmtDateTime(mail.sent_at)}
                </time>{" "}
              </span>
            ) : null}
            <span>
              {`an ${mail.to.map((a) => contactName(a, contacts)).join(", ")}${simulated ? " als Testversand, nicht zugestellt" : ""}. Antworten auf diese E-Mail ordnet Klara diesem Vorgang zu.`}
            </span>
          </p>
          {polling ? (
            <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
              {lastCheck?.error ? (
                <span key="error" className="text-light-red-text">
                  {lastCheck.error}
                </span>
              ) : (
                <span key="ok">
                  <span>Klara prüft das Postfach alle 10 Sekunden</span>
                  {lastCheck ? (
                    <span>
                      , zuletzt um{" "}
                      <span key={lastCheck.at.toISOString()} className="font-mono">
                        {fmtTime(lastCheck.at)}
                      </span>
                    </span>
                  ) : null}
                  <span>.</span>
                </span>
              )}{" "}
              <button
                type="button"
                onClick={() => setCheckNonce((n) => n + 1)}
                className="rounded-sm text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                Jetzt prüfen
              </button>
            </p>
          ) : null}
        </div>
      </div>
      {late ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Noch keine Antwort?{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => void simulate()}
            className="rounded-sm text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <span key={busy ? "busy" : "idle"}>{busy ? "Antwort wird eingespielt …" : "Antwort simulieren"}</span>
          </button>{" "}
          (Zurückweisung des Bauherrn, für die Vorführung)
        </p>
      ) : null}
    </section>
  );
}

/** "Folgeschreiben öffnen" per letter type (SPEC §6.4 proposals). */
const OPEN_FOLLOWUP_DE: Record<string, string> = {
  stellungnahme_zurueckweisung: "Stellungnahme öffnen",
  ergaenzung: "Ergänzung öffnen",
  mehrkostenanzeige: "Mehrkostenanzeige öffnen",
  anordnung_bestaetigung: "Bestätigung öffnen",
};

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Calendar days from the demo "now" to a YYYY-MM-DD date (Berlin day of `now`). */
function daysUntil(day: string, now: string | null): number | null {
  if (!now) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(now));
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** § 650b Abs. 2 BGB: after 30 days without agreement the client may order the change. */
function BgbPeriod({ until, now }: { until: string; now: string | null }) {
  const left = daysUntil(until, now);
  return (
    <p className="mt-2 text-sm text-foreground">
      <span className="text-muted-foreground">Einigungsfrist nach § 650b Abs. 2 BGB: </span>
      30 Tage ab Zugang, bis <span className="font-mono">{fmtDate(`${until}T12:00:00Z`)}</span>
      {left === null ? null : left > 1 ? (
        <>
          {" "}(noch <span className="font-mono">{left}</span> Tage)
        </>
      ) : left === 1 ? (
        " (noch 1 Tag)"
      ) : left === 0 ? (
        " (endet heute)"
      ) : (
        " (abgelaufen)"
      )}
    </p>
  );
}

/** On a follow-up letter: why it exists, before anything else (Klara's Hinweis and the client's words). */
function FollowupNote({ c, parent, now }: { c: CaseView; parent: CaseView; now: string | null }) {
  const quote = str(c.facts.reply_quote) ?? str(c.facts._reply_quote);
  const date = str(c.facts.reply_date) ?? str(c.facts._reply_date);
  const bgb = str(c.facts._bgb_650b_until);
  return (
    <section aria-label="Hinweis von Klara" className="flex max-w-[760px] items-start gap-3 rounded-xl border border-border bg-background px-5 py-4">
      <KlaraAvatar size={32} className="shrink-0" />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-foreground">Hinweis von Klara</p>
        <p className="text-foreground">{String(c.facts._hint_de)}</p>
        {quote ? (
          <p className="mt-2 text-muted-foreground">
            Antwort des Bauherrn{date ? (
              <>
                {" "}vom <span className="font-mono">{fmtDate(`${date}T12:00:00Z`)}</span>
              </>
            ) : null}{" "}
            auf <span className="font-mono">{parent.reference}</span>: „{quote}“
          </p>
        ) : null}
        {bgb ? <BgbPeriod until={bgb} now={now} /> : null}
      </div>
    </section>
  );
}

function ReplyCard({ reply, data, contacts, now }: { reply: EmailIn; data: CaseDetail; contacts: Contacts; now: string | null }) {
  const cls = reply.classification as ReplyClassification | null;
  const kind = cls?.kind ?? "other";
  const sender = contacts.find((x) => x.email?.toLowerCase() === reply.from_addr.toLowerCase()) ?? null;
  const who = sender ? ROLE_GENITIVE_DE[sender.role] : "des Absenders";
  // Quotation marks only around the client's own words; otherwise Klara's summary, labelled as such.
  const quote = cls ? (cls.quote === undefined ? (cls.key_points[0] ?? null) : cls.quote) : null;
  // The letters Klara prepared for this answer: Stellungnahme, Ergänzung, or Mehrkosten + Bestätigung.
  const ofReply = data.children.filter((x) => x.facts._reply_email_id === reply.id);
  const followups = ofReply.length ? ofReply : data.children.filter((x) => x.doc_type === "stellungnahme_zurueckweisung").slice(0, 1);
  const followup = followups[0] ?? null;
  const bgb = str(followup?.facts._bgb_650b_until);
  const hint =
    typeof followup?.facts._hint_de === "string"
      ? followup.facts._hint_de
      : kind === "acceptance"
        ? "Der Auftraggeber hat zugestimmt. Der Vorgang ist abgeschlossen."
        : null;
  return (
    <section aria-labelledby="reply-h" className="rounded-xl border border-border bg-background">
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="reply-h" className="text-base font-semibold tracking-tight text-foreground">
            Antwort {who}: {REPLY_KIND_DE[kind]}
          </h2>
          <time dateTime={reply.received_at} className="shrink-0 font-mono text-xs text-muted-foreground">
            {fmtDateTime(reply.received_at)}
          </time>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {sender ? `${sender.name}, ${sender.organisation}` : reply.from_addr}, per E-Mail
        </p>
        {quote ? (
          <blockquote lang="de" className="mt-3 text-[15px] leading-6 text-foreground">
            „{quote}“
          </blockquote>
        ) : cls?.summary_de ? (
          <p className="mt-3 text-sm text-foreground">
            <span className="text-muted-foreground">Kernaussage laut Klara: </span>
            {cls.summary_de}
          </p>
        ) : null}
        {cls?.requested_items.length ? (
          <ul className="mt-2 list-disc pl-5 text-sm text-foreground">
            {cls.requested_items.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : null}
        <details className="mt-3 text-sm">
          <summary className="w-fit cursor-pointer rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            Ganze Antwort lesen
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-foreground">{reply.body_text || "Ohne Text"}</p>
        </details>
      </div>
      {hint || followup ? (
        <div className="flex items-center justify-between gap-6 rounded-b-xl border-t border-border bg-surface px-5 py-4">
          {hint ? (
            <div className="flex min-w-0 items-start gap-3">
              <KlaraAvatar size={32} className="shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Hinweis von Klara</p>
                <p className="text-sm text-foreground">{hint}</p>
                {bgb ? <BgbPeriod until={bgb} now={now} /> : null}
              </div>
            </div>
          ) : (
            <span />
          )}
          {followups.length ? (
            <div className="flex shrink-0 flex-col items-stretch gap-2">
              {followups.map((f, i) => (
                <Link
                  key={f.id}
                  href={`/admin/case/${f.id}`}
                  className={buttonVariants({ size: "lg", variant: i ? "outline" : "default", className: "justify-between gap-3 px-4" })}
                >
                  {OPEN_FOLLOWUP_DE[f.doc_type] ?? `${docTitle(f.doc_type)} öffnen`}
                  <span className="font-mono">{f.reference}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
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

function EvidenceList({ evidence, live, author }: { evidence: Evidence[]; live: CaseDetail["live_transcript"]; author: string | null }) {
  if (!evidence.length && !live) {
    return (
      <Empty icon={<MessagesSquare className="size-5" aria-hidden />} title="Noch keine Nachweise">
        Gesprächsprotokoll und Wetterdaten werden beim Bestätigen durch den Polier angehängt.
      </Empty>
    );
  }
  const order = { transcript: 0, weather: 1, photo: 2, diary: 3, email: 4, meeting: 5 } as const;
  const photos = evidence.filter((e) => e.kind === "photo").sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <div className="max-w-[760px] space-y-4">
      {live ? (
        <TranscriptSection
          title={`Gesprächsprotokoll (${live.conversation_kind === "call" ? "Anruf" : "Chat"})`}
          note="Stand des Gesprächs, vom Polier noch nicht bestätigt."
          turns={live.turns as TranscriptTurn[]}
          author={author}
        />
      ) : null}
      {[...evidence]
        .sort((a, b) => order[a.kind] - order[b.kind])
        // All photos show as one grid, where the first one sorts.
        .filter((e) => e.kind !== "photo" || e.id === photos[0]?.id)
        .map((e) =>
          e.kind === "photo" ? (
            <Photos key="photos" photos={photos} />
          ) : e.kind === "transcript" ? (
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
  return <TranscriptSection title={`Gesprächsprotokoll (${via})`} at={e.created_at} turns={turns} author={author} />;
}

/**
 * What was said, for verification and documentation: each line in the original
 * language (tagged when it is not German) with the German translation under it.
 */
function TranscriptSection({ title, at, note, turns, author }: { title: string; at?: string; note?: string; turns: TranscriptTurn[]; author: string | null }) {
  const foreign = turns.some((t) => t.language && t.language !== "de");
  return (
    <Section title={title} at={at} icon={<MessagesSquare className="size-4 text-muted-foreground" aria-hidden />}>
      {note || foreign ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {[note, foreign ? "Original mit deutscher Übersetzung darunter." : null].filter(Boolean).join(" ")}
        </p>
      ) : null}
      <ol className="space-y-3">
        {turns.map((t, i) => {
          const translated = !!t.text_de && t.text_de !== t.text;
          return (
            <li key={i} className="grid grid-cols-[48px_128px_minmax(0,1fr)] gap-3 text-sm">
              <time dateTime={t.at} className="pt-px font-mono text-xs text-muted-foreground">
                {fmtTime(t.at)}
              </time>
              <span className={cn("font-medium", t.role === "klara" ? "text-muted-foreground" : "text-foreground")}>
                {t.role === "klara" ? "Klara" : (author ?? "Polier")}
              </span>
              <div className="min-w-0">
                <p lang={t.language ?? undefined} className="text-foreground">
                  {translated && t.language ? (
                    <span className="mr-1.5 font-mono text-xs text-muted-foreground" aria-label={`Original, Sprache ${t.language.toUpperCase()}`}>
                      {t.language.toUpperCase()}
                    </span>
                  ) : null}
                  {t.text}
                </p>
                {translated ? (
                  <p lang="de" className="mt-0.5 text-muted-foreground">
                    <span className="mr-1.5 font-mono text-xs" aria-label="Deutsche Übersetzung">
                      DE
                    </span>
                    {t.text_de}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function Photos({ photos }: { photos: Evidence[] }) {
  return (
    <Section title={`Fotos von der Baustelle (${photos.length})`} icon={<Camera className="size-4 text-muted-foreground" aria-hidden />}>
      <ul className="grid grid-cols-3 gap-3">
        {photos.map((p) => {
          const by = typeof p.data.by === "string" ? p.data.by : "Polier";
          return (
            <li key={p.id}>
              <a
                href={`/api/photos/${p.id}`}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-lg border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- private API image */}
                <img src={`/api/photos/${p.id}`} alt={`Foto von ${by}, ${fmtDateTime(p.created_at)}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              </a>
              <p className="mt-1 text-xs text-muted-foreground">
                {by}, <time dateTime={p.created_at} className="font-mono">{fmtDateTime(p.created_at)}</time>
              </p>
            </li>
          );
        })}
      </ul>
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

/** The history of the whole chain of letters, newest first; entries of linked letters name their letter. */
function Timeline({ events, chain, current }: { events: CaseDetail["events"]; chain: CaseDetail["chain"]; current: string }) {
  const shown = events.filter((e) => eventTitle(e));
  if (!shown.length) return <Empty title="Noch kein Verlauf">Ereignisse zu diesem Vorgang erscheinen hier.</Empty>;
  const linked = chain.length > 1;
  const caseOf = (id: string | null) => chain.find((x) => x.id === id) ?? null;
  return (
    <div className="max-w-[760px]">
      {linked ? (
        <p className="mb-3 text-sm text-muted-foreground">
          Verlauf aller verknüpften Schreiben:{" "}
          {chain.map((x, i) => (
            <span key={x.id}>
              {i ? " → " : null}
              {x.id === current ? (
                <span aria-current="page" className="text-foreground">
                  <span className="font-mono">{x.reference}</span> {docTitle(x.doc_type)}
                </span>
              ) : (
                <Link
                  href={`/admin/case/${x.id}`}
                  className="text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-mono">{x.reference}</span> {docTitle(x.doc_type)}
                </Link>
              )}
            </span>
          ))}
        </p>
      ) : null}
      <ol className="divide-y divide-border rounded-xl border border-border bg-background">
        {shown.map((e) => {
          const other = linked && e.case_id !== current ? caseOf(e.case_id) : null;
          return (
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
                {other ? (
                  <Link
                    href={`/admin/case/${other.id}`}
                    className="mt-0.5 inline-block text-xs text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="font-mono">{other.reference}</span> {docTitle(other.doc_type)}
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
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
    ...(typeof c.facts._hint_de === "string" ? [{ label: "Hinweis von Klara", value: c.facts._hint_de }] : []),
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
                {f.type === "list" && Array.isArray(c.facts[f.key]) ? (
                  <ul className="mt-0.5 list-disc space-y-1 pl-4">
                    {(c.facts[f.key] as unknown[]).map((x) => (
                      <li key={String(x)}>{String(x)}</li>
                    ))}
                  </ul>
                ) : (
                  formatFact(f.type, c.facts[f.key])
                )}
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
