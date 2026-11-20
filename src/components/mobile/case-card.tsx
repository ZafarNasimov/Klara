// Document card in the team channel (SPEC §8): type, reference, status,
// traffic light with its reason, deadline. The whole card opens the case.
import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { DeadlineBadge } from "@/components/klara/deadline-badge";
import { LightSummary } from "@/components/klara/traffic-light";
import { docTitle } from "@/lib/doctypes";
import { CASE_STATUS_DE } from "@/lib/labels";
import type { CaseView } from "@/lib/types";
import { cn } from "@/lib/utils";

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
          <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{c.reference}</span>
            <span className="rounded-md bg-muted px-1.5 py-px text-xs font-medium text-foreground">{CASE_STATUS_DE[c.status]}</span>
          </p>
        </div>
        <ChevronRight className="mt-2 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
      <LightSummary checks={c.checks} className="mt-3" />
      {c.deadline ? <DeadlineBadge d={c.deadline} className="mt-3" /> : null}
    </Link>
  );
}
