import { Suspense } from "react";

// M2: tabs Dokument / Nachweise / Verlauf / Hinweise with Validieren etc.
export default function AdminCasePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Shell params={params} />
    </Suspense>
  );
}

async function Shell({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <h1 className="text-xl font-semibold text-foreground">Vorgang</h1>
      <p className="mt-1 font-mono text-sm text-muted-foreground">{id}</p>
      <p className="mt-6 text-sm text-muted-foreground">Dokumentansicht, Nachweise und Verlauf folgen in Meilenstein 2.</p>
    </main>
  );
}
