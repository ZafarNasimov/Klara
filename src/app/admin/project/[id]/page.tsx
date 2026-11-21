import type { Metadata } from "next";
import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard/dashboard";
import { parseFilters } from "@/lib/dashboard/compute";

export const metadata: Metadata = { title: "Baustelle" };

/** Project dashboard: one site, the same widgets. */
export default function ProjectDashboardPage({ params, searchParams }: PageProps<"/admin/project/[id]">) {
  return (
    <Suspense>
      <ProjectDashboard params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProjectDashboard({ params, searchParams }: Pick<PageProps<"/admin/project/[id]">, "params" | "searchParams">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const p = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  return <Dashboard initial={parseFilters(p, id)} fixedProject={id} />;
}
