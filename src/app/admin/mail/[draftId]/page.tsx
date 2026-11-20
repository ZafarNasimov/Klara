import { Suspense } from "react";

// M4: e-mail composer (To, CC, subject, attachments, AI body, Senden).
export default function MailDraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  return (
    <Suspense>
      <Shell params={params} />
    </Suspense>
  );
}

async function Shell({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-xl font-semibold text-foreground">E-Mail vorbereiten</h1>
      <p className="mt-1 font-mono text-sm text-muted-foreground">{draftId}</p>
      <p className="mt-6 text-sm text-muted-foreground">Der E-Mail-Versand folgt in Meilenstein 4.</p>
    </main>
  );
}
