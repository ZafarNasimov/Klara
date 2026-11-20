// Deadline badge. A clock and the German deadline text; it borrows no
// traffic-light dot (those belong to the checks). Overdue is the one state
// that gets weight and the red text, because it blocks the case.
import { Clock } from "lucide-react";
import type { DeadlineInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DeadlineBadge({ d, className }: { d: DeadlineInfo | null | undefined; className?: string }) {
  if (!d) return null;
  const overdue = d.status === "overdue";
  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 text-sm whitespace-nowrap",
        overdue ? "font-medium text-light-red-text" : d.status === "ok" ? "text-foreground" : "font-medium text-foreground",
        className,
      )}
    >
      <Clock className={cn("size-3.5 shrink-0", overdue ? "text-light-red-text" : "text-muted-foreground")} aria-hidden />
      <span className="truncate">
        <span className="sr-only">Frist: </span>
        {d.label_de}
      </span>
    </span>
  );
}
