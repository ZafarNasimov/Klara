import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { RoleSwitcher } from "@/components/klara/role-switcher";
import { $t } from "@/lib/i18n";

/** Mobile top bar: 56px, back target 48px, role switcher on the right. */
export function MobileHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Zurück",
  leading,
  trailing,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  backLabel?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1 border-b border-border bg-background px-1 pt-[env(safe-area-inset-top)]">
      {backHref ? (
        <Link
          href={backHref}
          aria-label={$t(backLabel)}
          className="flex size-12 shrink-0 items-center justify-center rounded-lg text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </Link>
      ) : (
        <span className="w-3" />
      )}
      {leading}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base leading-tight font-semibold text-foreground">{title}</h1>
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {trailing}
      <RoleSwitcher variant="menu" />
    </header>
  );
}
