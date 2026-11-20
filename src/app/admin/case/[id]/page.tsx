import type { Metadata } from "next";
import { Suspense } from "react";
import { CaseDetailView } from "./case-detail";

export const metadata: Metadata = { title: "Vorgang" };

/** Case detail for the office (SPEC §8 /admin/case/[id]). */
export default function AdminCasePage({ params }: PageProps<"/admin/case/[id]">) {
  return (
    <Suspense>
      <AdminCase params={params} />
    </Suspense>
  );
}

async function AdminCase({ params }: { params: PageProps<"/admin/case/[id]">["params"] }) {
  const { id } = await params;
  return <CaseDetailView id={id} />;
}
