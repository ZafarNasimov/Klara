"use client";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ROLES, useRole, type UiRole } from "@/lib/role";
import { cn } from "@/lib/utils";

/** Role switcher (no real auth in the prototype). Switching opens the role's surface. */
export function RoleSwitcher({ variant = "segmented", className }: { variant?: "segmented" | "menu"; className?: string }) {
  const { role, setRole } = useRole();
  const router = useRouter();
  const choose = (r: UiRole) => {
    setRole(r);
    const home = ROLES.find((x) => x.id === r)!.home;
    if (!window.location.pathname.startsWith(home)) router.push(home);
  };

  if (variant === "menu") {
    const current = ROLES.find((r) => r.id === role)!;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex h-12 items-center gap-1 rounded-lg px-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          aria-label={`Rolle wechseln, aktuell ${current.label}`}
        >
          {current.label}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuRadioGroup value={role} onValueChange={(v) => choose(v as UiRole)}>
            {ROLES.map((r) => (
              <DropdownMenuRadioItem key={r.id} value={r.id} className="min-h-11">
                <span className="flex flex-col">
                  <span>{r.label}</span>
                  <span className="text-xs text-muted-foreground">{r.userName}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div role="radiogroup" aria-label="Rolle" className={cn("inline-flex rounded-lg border border-border bg-surface p-0.5", className)}>
      {ROLES.map((r) => (
        <button
          key={r.id}
          type="button"
          role="radio"
          aria-checked={role === r.id}
          onClick={() => choose(r.id)}
          title={r.userName}
          className={cn(
            "h-8 rounded-md px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            role === r.id ? "bg-background font-medium text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
