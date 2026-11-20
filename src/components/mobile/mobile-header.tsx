import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { RoleSwitcher } from "@/components/klara/role-switcher";

export function MobileHeader({
  title,
  subtitle,
  backHref,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-none">
      <div className="flex h-16 items-center gap-2 px-2">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Zurück"
            className="flex size-12 items-center justify-center rounded-lg text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-6" />
          </Link>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </header>
  );
}

export function MobileFooterRole() {
  return (
    <div className="flex justify-center border-t border-border bg-muted px-4 py-3">
      <RoleSwitcher compact />
    </div>
  );
}
