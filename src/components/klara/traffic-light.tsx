// Traffic light (DESIGN.md): green = bereit, amber = fehlt / automatisch
// korrigiert, red = blockiert. Never decorative, always with a German reason.
import type { CheckResult, Light } from "@/lib/types";
import { cn } from "@/lib/utils";
import { $t, $tx } from "@/lib/i18n";

export const LIGHT_DE: Record<Light, string> = { green: "Grün", yellow: "Gelb", red: "Rot" };
/** State words for screen readers (DESIGN.md), never the colour name alone. */
export const LIGHT_STATE_DE: Record<Light, string> = { green: "bereit", yellow: "Hinweis", red: "blockiert" };

const DOT: Record<Light, string> = {
  green: "bg-light-green",
  yellow: "bg-light-yellow",
  red: "bg-light-red",
};
const TEXT: Record<Light, string> = {
  green: "text-light-green-text",
  yellow: "text-light-yellow-text",
  red: "text-light-red-text",
};

/** Worst light of a set of checks (red > yellow > green). */
export function overallLight(checks: CheckResult[]): Light {
  if (checks.some((c) => c.light === "red")) return "red";
  if (checks.some((c) => c.light === "yellow")) return "yellow";
  return "green";
}

/** Dot with a shape cue so status never relies on color alone. */
export function LightDot({ light, className }: { light: Light; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2.5 shrink-0",
        DOT[light],
        light === "red" ? "rounded-[2px]" : light === "yellow" ? "rotate-45 rounded-[1px]" : "rounded-full",
        className,
      )}
    />
  );
}

/** One-line summary: worst light + the most important reason. */
export function LightSummary({ checks, className, compact = false }: { checks: CheckResult[]; className?: string; compact?: boolean }) {
  if (!checks.length) return null;
  const light = overallLight(checks);
  const lead = checks.find((c) => c.light === light) ?? checks[0];
  const others = checks.filter((c) => c.light === light).length - 1;
  return (
    <p className={cn("flex min-w-0 items-center gap-2 text-sm", className)}>
      <LightDot light={light} />
      <span className="sr-only">{$t(LIGHT_STATE_DE[light])}:</span>
      <span className={cn("min-w-0", compact ? "truncate" : "", light === "green" ? "text-foreground" : TEXT[light])}>
        {light === "green" ? $t("Alle Prüfungen bestanden") : $tx(lead.reason_de)}
        {light !== "green" && others > 0 ? <span className="text-muted-foreground"> {$t("(+{n} weitere)", { n: others })}</span> : null}
      </span>
    </p>
  );
}

/** Full list of checks with label, light and reason. */
export function CheckList({ checks, className }: { checks: CheckResult[]; className?: string }) {
  return (
    <ul className={cn("divide-y divide-border", className)}>
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-3 py-2.5">
          <LightDot light={c.light} className="mt-1.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {$t(c.label_de)}
              <span className="sr-only">: {$t(LIGHT_STATE_DE[c.light])}</span>
            </p>
            <p className={cn("text-sm", c.light === "green" ? "text-muted-foreground" : TEXT[c.light])}>{$tx(c.reason_de)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
