"use client";
// Mobile case page (SPEC §8 /app/case/[id]): what the Polier reported became
// this letter. Status as a next-step sentence, the letter itself, the traffic
// light, the facts Klara recorded, and two actions: "PDF öffnen" and
// "Per Sprache korrigieren" (Klara asks in the team chat what to change).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, MessageSquare, Mic } from "lucide-react";
import { useState } from "react";
import { formatFact } from "@/components/admin/format-fact";
import { LetterThumb } from "@/components/documents/letter-thumb";
import { DeadlineBadge } from "@/components/klara/deadline-badge";
import { CheckList, LightDot } from "@/components/klara/traffic-light";
import { BTN_OUTLINE, BTN_PRIMARY } from "@/components/mobile/buttons";
import { nextStepDe } from "@/components/mobile/case-card";
import { MobileHeader } from "@/components/mobile/mobile-header";
import { Skeleton } from "@/components/ui/skeleton";
import { docTitle, getDocType, hasValue } from "@/lib/doctypes";
import type { DocBody } from "@/lib/documents/types";
import { fmtDateTime } from "@/lib/labels";
import { useRole } from "@/lib/role";
import type { CaseDetail, CaseStatus, CaseView } from "@/lib/types";
import { ApiError, postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

const SENT = new Set<CaseStatus>(["versendet", "beantwortet", "abgeschlossen"]);

export function MobileCaseView({ id }: { id: string }) {
  const { data, error, reload } = useApi<CaseDetail>(`/api/cases/${id}`);
  const user = useRole();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!data) {
    return (
      <>
        <MobileHeader title="Vorgang" backHref="/app" />
        {error ? (
          <main className="flex flex-1 flex-col items-center px-6 py-12 text-center">
            <p className="text-base font-medium text-foreground">Der Vorgang konnte nicht geladen werden.</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <button type="button" onClick={reload} className={cn(BTN_OUTLINE, "mt-4")}>
              Erneut laden
            </button>
          </main>
        ) : (
          <CaseSkeleton />
        )}
      </>
    );
  }

  const c = data.case;
  const latest = data.versions[0] ?? null;
  const channel = c.team_id ? `/app/channel/${c.team_id}` : "/app";
  const sent = SENT.has(c.status);
  const returned = c.flags.includes("returned") || c.flags.includes("collecting");
  const correcting = c.flags.includes("correcting");
  const question = returned
    ? (data.events.filter((e) => e.kind === "returned_for_completion").sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.payload
        .note as string | undefined)
    : undefined;

  const correct = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await postJson(`/api/cases/${c.id}/correct`, { user_id: user.userId });
      router.push(channel);
    } catch (e) {
      setActionError(e instanceof ApiError && e.status < 500 ? e.message : "Klara ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.");
      setBusy(false);
    }
  };

  const pdfHref = latest ? `/api/documents/${latest.id}/pdf?variant=letter` : null;
  const toChat = (label: string) => (
    <Link href={channel} className={BTN_PRIMARY}>
      <MessageSquare aria-hidden />
      {label}
    </Link>
  );
  const primary = sent ? null : c.status === "entwurf" ? (
    toChat("Im Chat bestätigen")
  ) : returned ? (
    toChat("Im Chat ergänzen")
  ) : correcting ? (
    toChat("Korrektur im Chat fortsetzen")
  ) : (
    <button type="button" onClick={correct} disabled={busy} aria-describedby={c.status === "validiert" ? "correct-note" : undefined} className={BTN_PRIMARY}>
      <Mic aria-hidden />
      {busy ? "Klara öffnet den Chat …" : "Per Sprache korrigieren"}
    </button>
  );
  const note = sent
    ? "Bereits an den Auftraggeber versendet. Änderungen gehen nur noch über die Bauleitung."
    : !latest
      ? "Das Schreiben entsteht, sobald Sie die Meldung im Chat bestätigen."
      : c.status === "validiert" && !returned && !correcting
        ? "Eine Korrektur hebt die Freigabe der Bauleitung auf. Sie prüft danach die neue Version."
        : null;

  return (
    <>
      <MobileHeader
        title={docTitle(c.doc_type)}
        subtitle={<span className="font-mono">{c.reference}</span>}
        backHref={channel}
        backLabel={c.team_name ? `Zurück zu ${c.team_name}` : "Zurück"}
      />

      <main className="flex-1 px-4 pt-5 pb-8">
        <section aria-label="Stand">
          <p className="text-[17px] leading-snug font-medium text-pretty text-foreground">{nextStepDe(c)}</p>
          {question ? (
            <div className="mt-3 rounded-lg border border-border bg-surface px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Frage der Bauleitung</p>
              <p className="mt-0.5 text-[15px] leading-snug text-foreground">{question}</p>
            </div>
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">
            {[c.team_name, c.author_name ? `gemeldet von ${c.author_name}` : null].filter(Boolean).join(", ")}
            {c.team_name || c.author_name ? " am " : "Gemeldet am "}
            <span className="font-mono">{fmtDateTime(c.created_at)}</span> Uhr
          </p>
          {c.deadline ? <DeadlineBadge d={c.deadline} className="mt-3" /> : null}
        </section>

        <section aria-labelledby="letter-h" className="mt-7">
          <h2 id="letter-h" className="text-[15px] font-semibold text-foreground">
            {c.doc_type === "bautagesbericht" ? "Bericht" : "Schreiben"}
          </h2>
          {latest && pdfHref ? (
            <>
              <LetterThumb body={latest.body as DocBody} href={pdfHref} className="mt-2 h-[236px]" />
              <p className="mt-2 text-sm text-muted-foreground">
                Version <span className="font-mono">{latest.version}</span> vom <span className="font-mono">{fmtDateTime(latest.created_at)}</span> Uhr
                {latest.validated_at && (c.status === "validiert" || sent) ? ", von der Bauleitung freigegeben" : null}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Noch kein Schreiben. Es entsteht, sobald Sie die Meldung im Chat bestätigen.</p>
          )}
        </section>

        {c.checks.length ? (
          <section aria-labelledby="checks-h" className="mt-7">
            <h2 id="checks-h" className="text-[15px] font-semibold text-foreground">
              Prüfungen durch Klara
            </h2>
            <CheckList checks={c.checks} className="mt-1" />
          </section>
        ) : null}

        <Facts c={c} />
      </main>

      <div className="sticky bottom-0 z-10 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="grid gap-2">
          {pdfHref ? (
            <a href={pdfHref} target="_blank" rel="noreferrer" className={primary ? BTN_OUTLINE : BTN_PRIMARY}>
              <FileText aria-hidden />
              PDF öffnen
            </a>
          ) : (
            <button type="button" disabled className={BTN_OUTLINE}>
              <FileText aria-hidden />
              PDF öffnen
            </button>
          )}
          {primary}
        </div>
        {actionError ? (
          <p role="alert" className="mt-2 text-sm text-light-red-text">
            {actionError}
          </p>
        ) : note ? (
          <p id="correct-note" className="mt-2 text-sm leading-snug text-muted-foreground">
            {note}
          </p>
        ) : null}
      </div>
    </>
  );
}

/** What Klara recorded, in the letter's German wording. Missing facts in amber. */
function Facts({ c }: { c: CaseView }) {
  const def = getDocType(c.doc_type);
  if (!def) return null;
  const inferred = Array.isArray(c.facts._inferred) ? (c.facts._inferred as string[]) : [];
  const shown = def.fields.filter((f) => hasValue(c.facts[f.key]) || c.missing_fields.includes(f.key));
  if (!shown.length) return null;
  return (
    <section aria-labelledby="facts-h" className="mt-7">
      <h2 id="facts-h" className="text-[15px] font-semibold text-foreground">
        Ihre Angaben
      </h2>
      <dl className="mt-1 divide-y divide-border">
        {shown.map((f) => {
          const missing = c.missing_fields.includes(f.key);
          const mono = f.type === "number" || f.type === "datetime" || f.type === "date";
          return (
            <div key={f.key} className="py-2.5">
              <dt className="text-sm text-muted-foreground">
                {f.label_de}
                {inferred.includes(f.key) ? <span> (aus dem Bauzeitenplan)</span> : null}
              </dt>
              <dd className={cn("mt-0.5 text-[15px] leading-snug text-foreground", mono && !missing && "font-mono")}>
                {missing ? (
                  <span className="inline-flex items-center gap-2 text-light-yellow-text">
                    <LightDot light="yellow" />
                    fehlt
                  </span>
                ) : (
                  formatFact(f.type, c.facts[f.key])
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function CaseSkeleton() {
  return (
    <main className="flex-1 px-4 pt-5" aria-busy>
      <Skeleton className="h-6 w-4/5" />
      <Skeleton className="mt-2 h-4 w-3/5" />
      <Skeleton className="mt-7 h-[236px] w-full rounded-xl" />
      <Skeleton className="mt-7 h-16 w-full" />
    </main>
  );
}
