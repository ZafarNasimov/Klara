"use client";
import { useRouter } from "next/navigation";
import { ROLES, useRole, type Role } from "@/lib/role";
import { cn } from "@/lib/utils";

export function RoleSwitcher({ compact = false }: { compact?: boolean }) {
  const { role, setRole } = useRole();
  const router = useRouter();
  const pick = (r: Role) => {
    setRole(r);
    const home = ROLES.find((x) => x.id === r)!.home;
    if (!window.location.pathname.startsWith(home)) router.push(home);
  };
  return (
    <div
      role="radiogroup"
      aria-label="Rolle wählen"
      className="inline-flex rounded-lg border border-border bg-muted p-0.5"
    >
      {ROLES.map((r) => (
        <button
          key={r.id}
          type="button"
          role="radio"
          aria-checked={role === r.id}
          onClick={() => pick(r.id)}
          className={cn(
            "rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact ? "h-9" : "h-8",
            role === r.id && "bg-background text-foreground shadow-[0_0_0_1px_var(--border)]",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
