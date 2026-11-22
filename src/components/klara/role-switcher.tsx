"use client";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { $t, type Lang } from "@/lib/i18n";
import { useLang } from "@/lib/i18n-provider";
import { ROLES, useRole, type UiRole } from "@/lib/role";
import { cn } from "@/lib/utils";

/** Role switcher (no real auth in the prototype). Switching opens the role's surface. */
export function RoleSwitcher({ variant = "segmented", className }: { variant?: "segmented" | "menu"; className?: string }) {
  const { role, setRole } = useRole();
  const [lang, setLang] = useLang();
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
          aria-label={$t("Ansicht und Sprache wechseln, aktuell {view}", { view: $t(current.label) })}
        >
          {$t(current.label)}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{$t("Ansicht")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={role} onValueChange={(v) => choose(v as UiRole)}>
              {ROLES.map((r) => (
                <DropdownMenuRadioItem key={r.id} value={r.id} className="min-h-11">
                  <span className="flex flex-col">
                    <span>{$t(r.label)}</span>
                    <span className="text-xs text-muted-foreground">{$t(r.hint)}</span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{$t("Sprache der Oberfläche")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLang(v as Lang)}>
              <DropdownMenuRadioItem value="de" className="min-h-11" lang="de">
                Deutsch
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="en" className="min-h-11" lang="en">
                English
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div role="radiogroup" aria-label={$t("Ansicht")} className={cn("inline-flex rounded-lg border border-border bg-surface p-0.5", className)}>
      {ROLES.map((r) => (
        <button
          key={r.id}
          type="button"
          role="radio"
          aria-checked={role === r.id}
          onClick={() => choose(r.id)}
          title={$t(r.hint)}
          className={cn(
            "h-8 rounded-md px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            role === r.id ? "bg-background font-medium text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {$t(r.label)}
        </button>
      ))}
    </div>
  );
}
