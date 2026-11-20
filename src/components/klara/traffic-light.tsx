// The traffic light. Status colors live only here (DESIGN.md) and always come
// with a German reason text.
import { cn } from "@/lib/utils";
import type { CheckResult, Light } from "@/lib/types";

const DOT: Record<Light, string> = {
  green: "bg-light-green",
  yellow: "bg-light-yellow",
  red: "bg-light-red",
};

const WORD: Record<Light, string> = {
  green: "Bereit",
  yellow: "Prüfen",
  red: "Blockiert",
};

export function LightDot({ light, className }: { light: Light; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", DOT[light], className)}
    />
  );
}

/** Overall light of a case = worst of its checks. */
export function overallLight(checks: CheckResult[]): Light {
  if (checks.some((c) => c.light === "red")) return "red";
  if (checks.some((c) => c.light === "yellow")) return "yellow";
  return "green";
}

export function LightSummary({ checks, className }: { checks: CheckResult[]; className?: string }) {
  if (!checks.length) {
    return <span className={cn("text-sm text-muted-foreground", className)}>Noch nicht geprüft</span>;
  }
  const light = overallLight(checks);
  const worst = checks.find((c) => c.light === light);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 text-sm", className)}>
      <LightDot light={light} />
      <span className="font-medium text-foreground">{WORD[light]}</span>
      {light !== "green" && worst && (
        <span className="truncate text-muted-foreground">{worst.reason_de}</span>
      )}
    </span>
  );
}

export function CheckList({ checks }: { checks: CheckResult[] }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-background">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-3 px-3 py-2.5">
          <LightDot light={c.light} className="mt-1.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{c.label_de}</p>
            <p className="text-sm text-muted-foreground">{c.reason_de}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
