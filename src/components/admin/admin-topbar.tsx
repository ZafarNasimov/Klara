"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { RoleSwitcher } from "@/components/klara/role-switcher";
import type { ProjectContext } from "@/lib/db/repo";
import { fmtDateTime } from "@/lib/labels";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Übersicht", exact: true },
  { href: "/admin/vorgaenge", label: "Vorgänge" },
  { href: "/admin/meetings", label: "Besprechungen" },
  { href: "/admin/demo", label: "Demo" },
];

type ProjectResponse = ProjectContext & { now: string; llm_mode: "live" | "mock"; backend: "memory" | "supabase" };

export function AdminTopbar() {
  const { data } = useApi<ProjectResponse>("/api/project", { pollMs: 30000 });
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-6 border-b border-border bg-background px-4">
      <Link href="/admin" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <KlaraAvatar size={28} />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">Klara</span>
      </Link>
      {/* The active tab reads the URL, which is only known at request time on dynamic routes. */}
      <Suspense fallback={<Nav path={null} />}>
        <ActiveNav />
      </Suspense>
      <div className="ml-auto flex items-center gap-4">
        {data ? (
          <p className="hidden text-sm text-muted-foreground lg:block" title="Uhrzeit der Demo-Uhr">
            {data.project.name}
            <span className="mx-2 text-border" aria-hidden>
              |
            </span>
            <span className="font-mono text-foreground">{fmtDateTime(data.now)}</span>
          </p>
        ) : null}
        <RoleSwitcher />
      </div>
    </header>
  );
}

function ActiveNav() {
  return <Nav path={usePathname()} />;
}

function Nav({ path }: { path: string | null }) {
  return (
    <nav aria-label="Bereiche" className="flex items-center gap-1">
      {NAV.map((n) => {
        const active =
          path !== null &&
          (n.exact ? path === n.href || path.startsWith("/admin/case") || path.startsWith("/admin/mail") : path.startsWith(n.href));
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
