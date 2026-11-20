// Deadline badge. The status (due today / overdue) uses the traffic-light
// colors because it is a status, always next to its German label.
import { Clock } from "lucide-react";
import type { DeadlineInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LightDot } from "./traffic-light";

export function DeadlineBadge({ d, className }: { d: DeadlineInfo | null | undefined; className?: string }) {
  if (!d) return null;
  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 text-sm whitespace-nowrap text-foreground",
        className,
      )}
    >
      {d.status === "ok" ? (
        <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      ) : (
        <LightDot light={d.status === "overdue" ? "red" : "yellow"} />
      )}
      <span className="truncate">{d.label_de}</span>
    </span>
  );
}
