import type { Metadata } from "next";
import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard/dashboard";
import { parseFilters } from "@/lib/dashboard/compute";

export const metadata: Metadata = { title: "Übersicht" };

/** Portfolio dashboard: all sites. */
export default function AdminHome({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense>
      <Portfolio searchParams={searchParams} />
    </Suspense>
  );
}

async function Portfolio({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const sp = await searchParams;
  const p = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  return <Dashboard initial={parseFilters(p)} />;
}
