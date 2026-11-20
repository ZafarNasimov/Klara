import { Suspense } from "react";
import { CaseDetail } from "@/components/admin/case-detail";

export default function AdminCasePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Resolve params={params} />
    </Suspense>
  );
}

async function Resolve({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseDetail id={id} />;
}
