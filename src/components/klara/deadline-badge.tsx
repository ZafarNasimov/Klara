// Deadline badge. Due/overdue use the traffic-light colors because they are a
// status, always with the German label as the reason.
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { LightDot } from "./traffic-light";

// Kept local so the client bundle does not pull in the holiday tables.
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });
const berlinDay = (d: Date) => dayFmt.format(d);

export type DeadlineView = { label_de: string; status: "ok" | "due_today" | "overdue" };

/** Rebuild the label on the client from the stored due date. */
export function deadlineFromCase(c: { deadline_at: string | null; deadline_rule: string | null }, now = new Date()): DeadlineView | null {
  if (!c.deadline_rule || c.deadline_rule === "none") return null;
  if (!c.deadline_at) return { label_de: c.deadline_rule.startsWith("before_") ? "vor Ausführungsbeginn – Beginn unbekannt" : "Frist offen", status: "due_today" };
  const dueDay = berlinDay(new Date(c.deadline_at));
  const today = berlinDay(now);
  const status = today < dueDay ? "ok" : today === dueDay ? "due_today" : "overdue";
  const date = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(c.deadline_at));
  if (c.deadline_rule === "unverzueglich") {
    return { status, label_de: status === "due_today" ? "unverzüglich – heute" : status === "overdue" ? `unverzüglich – seit ${date} fällig` : `unverzüglich – ${date}` };
  }
  if (c.deadline_rule.startsWith("before_")) return { status, label_de: `vor Ausführungsbeginn – bis ${date}` };
  return { status, label_de: `Frist bis ${date}` };
}

export function DeadlineBadge({ d, className }: { d: DeadlineView | null; className?: string }) {
  if (!d) return null;
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-sm text-foreground",
        className,
      )}
    >
      {d.status === "ok" ? <Clock className="size-3.5 text-muted-foreground" aria-hidden /> : <LightDot light={d.status === "overdue" ? "red" : "yellow"} />}
      {d.label_de}
    </span>
  );
}
