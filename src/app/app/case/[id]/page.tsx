import { Suspense } from "react";
import { MobileHeader } from "@/components/mobile/mobile-header";

// M2 fills this with the case card (type, status, light, PDF).
export default function MobileCasePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Shell params={params} />
    </Suspense>
  );
}

async function Shell({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <MobileHeader title="Vorgang" backHref="/app" />
      <main className="flex-1 px-4 py-5">
        <p className="font-mono text-sm text-muted-foreground">{id}</p>
      </main>
    </>
  );
}
