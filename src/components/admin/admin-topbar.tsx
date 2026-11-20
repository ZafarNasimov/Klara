"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { RoleSwitcher } from "@/components/klara/role-switcher";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Vorgänge" },
  { href: "/admin/meetings", label: "Besprechungen" },
  { href: "/admin/demo", label: "Demo" },
];

export function AdminTopbar() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-6 border-b border-border bg-background px-4">
      <Link href="/admin" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <KlaraAvatar size={28} />
        <span className="text-base font-semibold text-foreground">Klara</span>
      </Link>
      <nav className="flex items-center gap-1" aria-label="Hauptnavigation">
        {NAV.map((n) => {
          const active = n.href === "/admin" ? path === "/admin" || path.startsWith("/admin/case") || path.startsWith("/admin/mail") : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                active && "bg-secondary text-foreground",
              )}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto">
        <RoleSwitcher />
      </div>
    </header>
  );
}
