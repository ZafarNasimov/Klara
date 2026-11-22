"use client";
import Link from "next/link";
import { ChevronRight, HardHat, Monitor } from "lucide-react";
import { useRole, type UiRole } from "@/lib/role";
import { $t } from "@/lib/i18n";

const ENTRIES: { role: UiRole; href: string; title: string; text: string; Icon: typeof HardHat }[] = [
  { role: "polier", href: "/app", title: "Baustelle", text: "Melden per Sprache oder Text", Icon: HardHat },
  { role: "bauleiter", href: "/admin", title: "Bauleitung", text: "Prüfen, freigeben, versenden", Icon: Monitor },
];

export function EntryLinks() {
  const { setRole } = useRole();
  return (
    <ul className="mt-10 w-full space-y-3 text-left">
      {ENTRIES.map(({ role, href, title, text, Icon }) => (
        <li key={href}>
          <Link
            href={href}
            onClick={() => setRole(role)}
            className="flex min-h-16 items-center gap-4 rounded-xl border border-border bg-background px-4 py-3 outline-none transition-colors hover:border-zinc-300 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block text-base font-medium text-foreground">{$t(title)}</span>
              <span className="block text-sm text-muted-foreground">{$t(text)}</span>
            </span>
            <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
