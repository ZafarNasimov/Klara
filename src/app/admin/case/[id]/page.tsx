import { Suspense } from "react";

/** Case detail (SPEC §8 /admin/case/[id], built in M2). */
export default function AdminCasePage({ params }: PageProps<"/admin/case/[id]">) {
  return (
    <Suspense>
      <AdminCase params={params} />
    </Suspense>
  );
}

async function AdminCase({ params }: { params: PageProps<"/admin/case/[id]">["params"] }) {
  const { id } = await params;
  return <main className="p-6 text-sm text-muted-foreground">Vorgang {id}</main>;
}
