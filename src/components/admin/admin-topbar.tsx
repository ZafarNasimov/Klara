"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { RoleSwitcher } from "@/components/klara/role-switcher";
import type { ProjectContext } from "@/lib/db/repo";
import { fmtDateTime } from "@/lib/labels";
import { useProjectId } from "@/lib/project-choice";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { $t } from "@/lib/i18n";
import { LangSwitch } from "@/lib/i18n-provider";

/** `also`: other routes that belong to the tab (a case or its e-mail is part of "Vorgänge", a site's dashboard of "Übersicht"). */
const NAV: { href: string; label: string; exact?: boolean; also?: string[] }[] = [
  { href: "/admin", label: "Übersicht", exact: true, also: ["/admin/project/"] },
  { href: "/admin/vorgaenge", label: "Vorgänge", also: ["/admin/case/", "/admin/mail/"] },
  { href: "/admin/meetings", label: "Besprechungen" },
  { href: "/admin/demo", label: "Einstellungen" },
];

type ProjectResponse = ProjectContext & { now: string; llm_mode: "live" | "mock"; backend: "memory" | "supabase" };

export function AdminTopbar() {
  const [projectId] = useProjectId();
  const { data } = useApi<ProjectResponse>(`/api/project?id=${projectId}`, { pollMs: 30000 });
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
          <p className="hidden text-sm whitespace-nowrap text-muted-foreground lg:block" title={$t("Uhrzeit der Demo-Uhr")}>
            {/* The chosen site only where the page is about it (not on the dashboards, which name their own). */}
            <Suspense fallback={null}>
              <SiteName name={data.project.name} />
            </Suspense>
            <span className="font-mono text-foreground">{fmtDateTime(data.now)}</span>
          </p>
        ) : null}
        <LangSwitch />
        <RoleSwitcher />
      </div>
    </header>
  );
}

function SiteName({ name }: { name: string }) {
  const path = usePathname();
  if (path === "/admin" || path.startsWith("/admin/project/")) return null;
  return (
    <>
      {name}
      <span className="mx-2 text-border" aria-hidden>
        |
      </span>
    </>
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
          path !== null && ((n.exact ? path === n.href : path.startsWith(n.href)) || !!n.also?.some((p) => path.startsWith(p)));
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
            {$t(n.label)}
          </Link>
        );
      })}
    </nav>
  );
}
