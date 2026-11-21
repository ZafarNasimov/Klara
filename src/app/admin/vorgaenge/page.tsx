import type { Metadata } from "next";
import { Suspense } from "react";
import { CaseBoard } from "@/components/admin/case-board";

export const metadata: Metadata = { title: "Vorgänge" };

/** Case board (project tree, case table, details). ?site= &trade= from the dashboard. */
export default function CasesPage({ searchParams }: PageProps<"/admin/vorgaenge">) {
  return (
    <Suspense>
      <Cases searchParams={searchParams} />
    </Suspense>
  );
}

async function Cases({ searchParams }: { searchParams: PageProps<"/admin/vorgaenge">["searchParams"] }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : null);
  return <CaseBoard projectId={one(sp.site)} trade={one(sp.trade)} />;
}
