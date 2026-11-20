// Document card in the team channel (SPEC §8): type, reference, status,
// traffic light with its reason, deadline. The whole card opens the case.
// On the phone the status is a sentence that says what happens next, so a
// lifecycle word never reads like a traffic-light state.
import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { DeadlineBadge } from "@/components/klara/deadline-badge";
import { LightSummary } from "@/components/klara/traffic-light";
import { docTitle } from "@/lib/doctypes";
import type { CaseStatus, CaseView } from "@/lib/types";
import { cn } from "@/lib/utils";

const NEXT_STEP_DE: Record<CaseStatus, string> = {
  entwurf: "Entwurf, noch nicht bestätigt.",
  unvollstaendig: "Liegt bei der Bauleitung, fehlende Angaben werden ergänzt.",
  bereit: "Liegt der Bauleitung zur Prüfung vor. Für Sie nichts zu tun.",
  validiert: "Von der Bauleitung freigegeben, wird versendet.",
  versendet: "An den Auftraggeber versendet.",
  beantwortet: "Antwort des Auftraggebers ist eingegangen.",
  abgeschlossen: "Abgeschlossen.",
};

/** What happens next, for the Polier. Office requests come first. */
export function nextStepDe(c: Pick<CaseView, "status" | "flags">): string {
  if (c.flags.includes("returned")) return "Die Bauleitung braucht noch eine Angabe von Ihnen. Klara fragt im Chat.";
  if (c.flags.includes("correcting")) return "Klara wartet im Chat auf Ihre Korrektur.";
  if (c.flags.includes("collecting")) return "Klara braucht im Chat noch eine Angabe von Ihnen.";
  return NEXT_STEP_DE[c.status];
}

export function CaseCard({ c, className }: { c: CaseView; className?: string }) {
  return (
    <Link
      href={`/app/case/${c.id}`}
      className={cn(
        "group block rounded-xl border border-border bg-background p-4 outline-none hover:border-zinc-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground" aria-hidden>
          <FileText className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug font-medium text-foreground">{docTitle(c.doc_type)}</p>
          <p className="mt-0.5 font-mono text-sm text-muted-foreground">{c.reference}</p>
        </div>
        <ChevronRight className="mt-2 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
      <p className="mt-3 text-sm leading-snug text-foreground">{nextStepDe(c)}</p>
      <LightSummary checks={c.checks} className="mt-2" />
      {c.deadline ? <DeadlineBadge d={c.deadline} className="mt-3" /> : null}
    </Link>
  );
}
