"use client";
// E-mail composer (SPEC §8 /admin/mail/[draftId]): the cover e-mail on the
// left, the letter page it carries on the right. "Senden" stays closed until
// the letter is validated (the Bauleiter can validate and send in one step),
// and the reason is always in view. The letter's addressee must be among the
// recipients. Edits save themselves; after sending the office lands back on
// the case, where the client's answer will arrive.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { ChevronLeft, Info, Paperclip, Send, X } from "lucide-react";
import { LetterThumb } from "@/components/documents/letter-thumb";
import { LightDot } from "@/components/klara/traffic-light";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { docTitle } from "@/lib/doctypes";
import type { DocBody } from "@/lib/documents/types";
import { fmtDateTime } from "@/lib/labels";
import { addresseeProblem, EMAIL, fieldBlocker } from "@/lib/mail/fields";
import { useRole } from "@/lib/role";
import type { MailDraftView } from "@/lib/types";
import { ApiError, postJson, sendJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { $t, $tx } from "@/lib/i18n";

type Contact = MailDraftView["contacts"][number];

export function MailComposer({ draftId, caseId }: { draftId: string; caseId: string | null }) {
  if (draftId !== "new") return <Composer id={draftId} />;
  if (!caseId) return <Failure message={$t("Zu welchem Vorgang? Bitte die E-Mail aus dem Vorgang heraus vorbereiten.")} caseId={null} />;
  return <NewDraft caseId={caseId} />;
}

/** `/admin/mail/new?case=…`: create (or reuse) the draft, then show it under its own address. */
function NewDraft({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    postJson<MailDraftView>("/api/mail/draft", { case_id: caseId })
      .then((v) => {
        if (live) router.replace(`/admin/mail/${v.draft.id}`);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof ApiError && e.status < 500 ? $tx(e.message) : $t("Die E-Mail konnte nicht vorbereitet werden. Bitte erneut versuchen."));
      });
    return () => {
      live = false;
    };
  }, [caseId, router]);
  if (error) return <Failure message={error} caseId={caseId} />;
  return <ComposerSkeleton note={$t("Klara bereitet die E-Mail vor …")} />;
}

function Composer({ id }: { id: string }) {
  // No live refetch: it would overwrite what the office is typing.
  const { data, error, reload } = useApi<MailDraftView>(`/api/mail/${id}`, { live: false, pollMs: 0 });
  if (error && !data) return <Failure message={error} caseId={null} />;
  if (!data) return <ComposerSkeleton />;
  return data.draft.status === "entwurf" ? (
    <DraftForm key={`${data.draft.id}:${data.draft.document_version_id}:${data.case.status}`} view={data} onStale={reload} />
  ) : (
    <SentMail view={data} />
  );
}

/** Addresses typed but not yet turned into tokens: the valid ones go out with the e-mail, an invalid one blocks. */
function parsePending(text: string): { ok: string[]; bad: string | null } {
  const parts = text
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { ok: parts.filter((p) => EMAIL.test(p)), bad: parts.find((p) => !EMAIL.test(p)) ?? null };
}

const sameMail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const contactOf = (email: string, contacts: Contact[]) => contacts.find((x) => sameMail(x.email, email)) ?? null;

// ── Draft ─────────────────────────────────────────────────────────────

function DraftForm({ view, onStale }: { view: MailDraftView; onStale: () => void }) {
  const router = useRouter();
  const user = useRole();
  const c = view.case;
  const [to, setTo] = useState(view.draft.to);
  const [cc, setCc] = useState(view.draft.cc);
  const [toText, setToText] = useState("");
  const [ccText, setCcText] = useState("");
  const [subject, setSubject] = useState(view.draft.subject);
  const [body, setBody] = useState(view.draft.body);
  const [docx, setDocx] = useState(false);
  const [sending, setSending] = useState(false);
  const [savedAs, setSavedAs] = useState(() => JSON.stringify({ to: view.draft.to, cc: view.draft.cc, subject: view.draft.subject, body: view.draft.body }));
  const [saveFailed, setSaveFailed] = useState(false);

  const snapshot = JSON.stringify({ to, cc, subject, body });
  const pending = snapshot !== savedAs;
  const url = `/api/mail/${view.draft.id}`;

  // Autosave 700 ms after the last edit.
  useEffect(() => {
    if (snapshot === savedAs) return;
    const t = setTimeout(() => {
      sendJson("PATCH", url, JSON.parse(snapshot))
        .then(() => {
          setSavedAs(snapshot);
          setSaveFailed(false);
        })
        .catch(() => setSaveFailed(true));
    }, 700);
    return () => clearTimeout(t);
  }, [snapshot, savedAs, url]);

  // What goes out: tokens plus valid addresses still in the input.
  const toPending = parsePending(toText);
  const ccPending = parsePending(ccText);
  const outgoing = {
    to: [...new Set([...to, ...toPending.ok])],
    cc: [...new Set([...cc, ...ccPending.ok])],
    subject,
    body,
  };

  const isBauleiter = user.role === "bauleiter";
  const validateAndSend = view.needs_validation && isBauleiter && !view.validation_blocker;
  const stateBlocker = view.needs_validation
    ? !isBauleiter
      ? $t("Das Schreiben ist noch nicht validiert. Validieren kann nur die Bauleitung (Rolle oben rechts wechseln).")
      : view.validation_blocker
    : view.state_blocker;
  const roleBlocker = user.role === "polier" ? $t("Senden kann nur die Bauleitung (oben rechts „Bauleitung“ wählen).") : null;
  const pendingBlocker = toPending.bad
    ? $t("An: „{bad}“ ist keine gültige E-Mail-Adresse.", { bad: toPending.bad })
    : ccPending.bad
      ? $t("CC: „{bad}“ ist keine gültige E-Mail-Adresse.", { bad: ccPending.bad })
      : null;
  const blocker = stateBlocker ?? roleBlocker ?? pendingBlocker ?? fieldBlocker(outgoing, view.addressee);
  const wrongAddressee = addresseeProblem(outgoing.to, view.addressee);
  const unauthorized = outgoing.to.map((a) => contactOf(a, view.contacts)).filter((k): k is Contact => !!k && !k.has_authority);

  const send = async () => {
    if (blocker || sending) return;
    setSending(true);
    try {
      await sendJson("PATCH", url, outgoing);
      await postJson(`${url}/send`, { user_id: user.userId, attach_docx: docx, validate: validateAndSend });
      if (view.delivery !== "simulated") toast.success($t("{doc} an {to} versendet", { doc: docTitle(c.doc_type), to: outgoing.to.join(", ") }));
      else toast($t("Testversand im Verlauf festgehalten, nicht zugestellt"));
      router.push(`/admin/case/${c.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError && e.status < 500 ? $tx(e.message) : $t("Senden hat nicht geklappt. Bitte erneut versuchen."));
      setSending(false);
      // A new letter version or a changed status: show the current state.
      if (e instanceof ApiError && e.status < 500) onStale();
    }
  };

  // Names stay on one line ("Dr. Petra Lang" must not break after "Dr.").
  const recipients = outgoing.to.map((a) => (contactOf(a, view.contacts)?.name ?? a).replace(/ /g, "\u00a0")).join(", ");
  const verb = validateAndSend ? $t("Validieren und senden") : $t("Senden");
  const status = blocker ? (
    <>
      {blocker}
      {view.needs_validation && view.validation_blocker && isBauleiter ? (
        <>
          {" "}
          <Link href={`/admin/case/${c.id}`} className="text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            {$t("Zum Vorgang")}
          </Link>
        </>
      ) : null}
    </>
  ) : validateAndSend ? (
    $t("Validiert Version {n} als {name} und sendet an {to}.", { n: view.version?.version ?? 1, name: user.userName, to: recipients })
  ) : (
    $t("Geht an {to}.", { to: recipients })
  );

  return (
    <Frame view={view} docx={docx} onDocx={setDocx}>
      <header className="border-b border-border bg-background px-8 pt-4 pb-5">
        <BackLink caseId={c.id} reference={c.reference} />
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-8">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{docTitle(c.doc_type)} versenden</h1>
            <VersionLine view={view} />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Button
              size="lg"
              className="px-4 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
              focusableWhenDisabled
              disabled={!!blocker || sending}
              aria-describedby="send-status"
              aria-keyshortcuts="Control+Enter"
              title={$t("Strg+Enter")}
              onClick={() => void send()}
            >
              <Send aria-hidden />
              {sending ? (validateAndSend ? $t("Wird validiert und gesendet …") : $t("Wird gesendet …")) : verb}
            </Button>
            <p id="send-status" className="max-w-[400px] text-right text-sm text-muted-foreground" aria-live="polite">
              {status}
            </p>
            <p className="text-right text-xs text-muted-foreground">
              {saveFailed ? $t("Entwurf nicht gespeichert; die Änderungen gehen beim Senden mit.") : pending ? $t("Wird gespeichert …") : $t("Entwurf gespeichert.")}
              {view.delivery === "simulated" ? $t(" Testmodus: wird nicht zugestellt.") : null}
            </p>
          </div>
        </div>
      </header>

      <form
        className="px-8 py-6"
        aria-label={$t("E-Mail")}
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void send();
          }
        }}
      >
        <div className="max-w-[760px] rounded-xl border border-border bg-background">
          <Row label="Von">
            <FromLine view={view} />
          </Row>
          <Row label="An" htmlFor="mail-to">
            <AddressField id="mail-to" label="An" values={to} onChange={setTo} text={toText} onText={setToText} contacts={view.contacts} invalid={!!wrongAddressee} />
            {wrongAddressee ? (
              <FieldNote light="red">{wrongAddressee}</FieldNote>
            ) : (
              <FieldNote light={view.recipient_check.light}>{$tx(view.recipient_check.reason_de)}</FieldNote>
            )}
            {unauthorized.map((k) => (
              <FieldNote key={k.email} light="yellow">
                {k.name} hat keine Vollmacht. Besser unter CC.
              </FieldNote>
            ))}
          </Row>
          <Row label="CC" htmlFor="mail-cc">
            <AddressField id="mail-cc" label="CC" values={cc} onChange={setCc} text={ccText} onText={setCcText} contacts={view.contacts} />
          </Row>
          <Row label={$t("Betreff")} htmlFor="mail-subject">
            <textarea
              id="mail-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value.replace(/\n/g, " "))}
              rows={1}
              aria-invalid={!subject.trim()}
              className="-mx-1 block w-full resize-none rounded-md bg-transparent px-1 py-1.5 text-sm leading-5 text-foreground outline-none [field-sizing:content] focus-visible:ring-2 focus-visible:ring-ring"
            />
            {!subject.trim() ? <FieldNote light="red">{$t("Bitte einen Betreff angeben.")}</FieldNote> : null}
          </Row>
          <label htmlFor="mail-body" className="sr-only">
            {$t("Nachricht")}
          </label>
          <textarea
            id="mail-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            spellCheck
            lang="de"
            aria-invalid={!body.trim()}
            className="block min-h-[340px] w-full resize-y rounded-b-xl bg-transparent px-5 py-4 text-sm leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          />
        </div>
        <p className="mt-2 flex max-w-[760px] items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" aria-hidden />
          {!body.trim() ? "Bitte einen Text angeben. " : null}
          {$t("Text von Klara vorgeschlagen. Vor dem Senden lesen; Rechtliches steht nur im Schreiben selbst.")}
        </p>
      </form>
    </Frame>
  );
}

/** A status line under a field: traffic-light shape plus the reason (DESIGN.md: color never alone). */
function FieldNote({ light, children }: { light: "green" | "yellow" | "red"; children: ReactNode }) {
  return (
    <p className={cn("mt-1.5 flex items-start gap-2 text-xs", light === "red" ? "text-light-red-text" : "text-muted-foreground")}>
      <LightDot light={light} className="mt-[3px]" />
      <span>{children}</span>
    </p>
  );
}

// ── Sent ──────────────────────────────────────────────────────────────

function SentMail({ view }: { view: MailDraftView }) {
  const c = view.case;
  const d = view.draft;
  const simulated = d.message_id?.startsWith("sim-") ?? false;
  return (
    <Frame view={view}>
      <header className="border-b border-border bg-background px-8 pt-4 pb-5">
        <BackLink caseId={c.id} reference={c.reference} />
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-8">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{docTitle(c.doc_type)} versendet</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {d.sent_at ? (
                <>
                  am{" "}
                  <time dateTime={d.sent_at} className="font-mono">
                    {fmtDateTime(d.sent_at)}
                  </time>{" "}
                </>
              ) : null}
              an {d.to.map((a) => contactLabel(a, view.contacts)).join(", ")}
            </p>
          </div>
          <Link href={`/admin/case/${c.id}`} className={buttonVariants({ size: "lg", className: "px-4" })}>
            {$t("Zum Vorgang")}
          </Link>
        </div>
      </header>
      <section className="px-8 py-6" aria-label={$t("Versendete E-Mail")}>
        <div className="max-w-[760px] rounded-xl border border-border bg-background">
          <Row label="Von">
            <FromLine view={view} />
          </Row>
          <Row label="An">
            <ReadAddresses values={d.to} contacts={view.contacts} />
          </Row>
          {d.cc.length ? (
            <Row label="CC">
              <ReadAddresses values={d.cc} contacts={view.contacts} />
            </Row>
          ) : null}
          <Row label={$t("Betreff")}>
            <p className="py-1.5 text-sm text-foreground">{d.subject}</p>
          </Row>
          <p className="whitespace-pre-wrap px-5 py-4 text-sm leading-6 text-foreground">{d.body}</p>
          {d.message_id && !simulated ? (
            <p className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
              Nachrichten-ID <span className="font-mono">{d.message_id}</span>
            </p>
          ) : null}
        </div>
      </section>
    </Frame>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────

/** Two columns: the e-mail, and the letter it carries. */
function Frame({ view, docx, onDocx, children }: { view: MailDraftView; docx?: boolean; onDocx?: (v: boolean) => void; children: ReactNode }) {
  const pdf = view.attachments.find((a) => a.kind === "pdf");
  const word = view.attachments.find((a) => a.kind === "docx");
  const sent = view.draft.status !== "entwurf";
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_400px]">
      <main className="min-h-0 overflow-y-auto">{children}</main>
      <aside aria-labelledby="attachment-h" className="min-h-0 overflow-y-auto border-l border-border bg-background px-5 py-5">
        <h2 id="attachment-h" className="text-sm font-medium text-foreground">
          {$t("Anhang")}
        </h2>
        {view.version && pdf ? (
          <>
            <LetterThumb whole body={view.version.body as DocBody} href={pdf.url} label={$t("{name} öffnen", { name: pdf.name })} className="mt-2 pb-5" />
            <ul className="mt-3 divide-y divide-border text-sm">
              <li className="flex min-h-10 items-center gap-2">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 truncate font-mono text-foreground">{pdf.name}</span>
                <a href={pdf.url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm", className: "ml-auto" })}>
                  {$t("Öffnen")}
                </a>
              </li>
              {word && !sent && onDocx ? (
                <li>
                  <label className="flex min-h-10 cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={!!docx} onChange={(e) => onDocx(e.target.checked)} className="size-4 accent-primary" />
                    <span className="text-foreground">{$t("Word-Datei mitsenden")}</span>
                    <span className="ml-auto truncate font-mono text-xs text-muted-foreground">{word.name}</span>
                  </label>
                </li>
              ) : null}
            </ul>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {$t("Die interne Prüfseite mit Gesprächsprotokoll und Prüfergebnissen wird nicht mitgesendet.")}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{$t("Kein Schreiben angehängt.")}</p>
        )}
      </aside>
    </div>
  );
}

function BackLink({ caseId, reference }: { caseId: string; reference: string }) {
  return (
    <Link
      href={`/admin/case/${caseId}`}
      className="-ml-2 inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronLeft className="size-4" aria-hidden />
      <span className="font-mono">{reference}</span>
    </Link>
  );
}

function VersionLine({ view }: { view: MailDraftView }) {
  const v = view.version;
  if (!v) return null;
  return (
    <p className="mt-0.5 text-sm text-muted-foreground">
      {$t("Schreiben Version")} <span className="font-mono">{v.version}</span>
      {v.validated_at ? (
        <>
          {$t(", validiert von {name} am", { name: view.validated_by_name ?? $t("der Bauleitung") })}{" "}
          <time dateTime={v.validated_at} className="font-mono">
            {fmtDateTime(v.validated_at)}
          </time>
        </>
      ) : (
        $t(", noch nicht validiert")
      )}
    </p>
  );
}

/** The sender as the client will read it; a test send says so in a few words. */
function FromLine({ view }: { view: MailDraftView }) {
  const sent = view.draft.status !== "entwurf";
  const simulated = sent ? (view.draft.message_id?.startsWith("sim-") ?? false) : view.delivery === "simulated";
  const s = view.sender;
  return (
    <p className="py-1.5 text-sm text-foreground">
      {s.name}, {s.role}, {s.company}
      {!simulated && view.from ? <span className="text-muted-foreground"> &lt;{view.from.replace(/^.*<|>.*$/g, "")}&gt;</span> : null}
      {simulated && sent ? <span className="text-muted-foreground"> {$t("(Testversand, nicht zugestellt)")}</span> : null}
    </p>
  );
}

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-3 border-b border-border px-5 py-2">
      <Label {...(htmlFor ? { htmlFor } : {})} className="pt-1.5 text-sm text-muted-foreground">
        {label}
      </Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function contactLabel(email: string, contacts: Contact[]): string {
  const k = contactOf(email, contacts);
  return k ? `${k.name} (${k.organisation})` : email;
}

function ReadAddresses({ values, contacts }: { values: string[]; contacts: Contact[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 py-1.5 text-sm">
      {values.map((a) => {
        const k = contactOf(a, contacts);
        return (
          <li key={a}>
            {k ? (
              <span className="text-foreground">
                {k.name}, {k.organisation}{" "}
              </span>
            ) : null}
            <span className={k ? "text-muted-foreground" : "text-foreground"}>{k ? `<${a}>` : a}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Addresses as removable tokens; type and press Enter or comma to add one.
 * Known contacts show their name; a contact without Vollmacht carries the amber mark.
 */
function AddressField({
  id,
  label,
  values,
  onChange,
  text,
  onText,
  contacts,
  invalid = false,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  text: string;
  onText: (v: string) => void;
  contacts: Contact[];
  invalid?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  const add = (raw: string) => {
    const { ok, bad } = parsePending(raw);
    if (bad) {
      setError($t("„{bad}“ ist keine gültige E-Mail-Adresse.", { bad }));
      return;
    }
    if (!ok.length) return;
    onChange([...new Set([...values, ...ok])]);
    onText("");
    setError(null);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" && !e.ctrlKey && !e.metaKey) || e.key === "," || e.key === ";") {
      e.preventDefault();
      add(text);
    }
  };

  const options = contacts.filter((k) => !values.some((v) => sameMail(v, k.email)));
  return (
    <div>
      <div className="-mx-1 flex min-h-8 flex-wrap items-center gap-1.5 rounded-md px-1 py-0.5 focus-within:ring-2 focus-within:ring-ring">
        {values.length ? (
          <ul aria-label={$t("Empfänger {field}", { field: label })} className="contents">
            {values.map((a) => {
              const k = contactOf(a, contacts);
              const noAuthority = !!k && !k.has_authority;
              return (
                <li key={a} className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border bg-surface pr-0.5 pl-2 text-sm">
                  {noAuthority ? <LightDot light="yellow" /> : null}
                  {k ? <span className="truncate text-foreground">{k.name}</span> : null}
                  <span className={cn("truncate", k ? "text-muted-foreground" : "text-foreground")}>{a}</span>
                  {noAuthority ? <span className="sr-only">{$t(", ohne Vollmacht")}</span> : null}
                  <button
                    type="button"
                    onClick={() => onChange(values.filter((x) => x !== a))}
                    aria-label={`${a} entfernen`}
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <input
          id={id}
          type="text"
          inputMode="email"
          list={`${id}-contacts`}
          value={text}
          onChange={(e) => {
            onText(e.target.value);
            setError(null);
          }}
          onKeyDown={onKey}
          onBlur={() => add(text)}
          placeholder={values.length ? "" : $t("Adresse eingeben")}
          autoComplete="off"
          aria-invalid={invalid || !!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-7 min-w-[180px] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-calendar-picker-indicator]:hidden"
        />
        <datalist id={`${id}-contacts`}>
          {options.map((k) => (
            <option key={k.email} value={k.email}>
              {k.name}, {k.organisation}
            </option>
          ))}
        </datalist>
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-light-red-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ── States ────────────────────────────────────────────────────────────

function ComposerSkeleton({ note }: { note?: string }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-4 px-8 py-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-80" />
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : <Skeleton className="h-4 w-72" />}
        <Skeleton className="mt-6 h-[420px] w-full max-w-[760px]" />
      </div>
      <div className="space-y-3 border-l border-border bg-background px-5 py-5">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="aspect-[210/297] w-full" />
      </div>
    </div>
  );
}

function Failure({ message, caseId }: { message: string; caseId: string | null }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <p className="text-base font-medium text-foreground">{$t("Die E-Mail ist nicht verfügbar.")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <div className="mt-4 flex justify-center gap-2">
        {caseId ? (
          <Link href={`/admin/case/${caseId}`} className={buttonVariants({ variant: "outline" })}>
            {$t("Zum Vorgang")}
          </Link>
        ) : null}
        <Link href="/admin/vorgaenge" className={buttonVariants({ variant: "ghost" })}>
          {$t("Zur Übersicht")}
        </Link>
      </div>
    </main>
  );
}
