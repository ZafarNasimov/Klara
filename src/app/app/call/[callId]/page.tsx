import { Suspense } from "react";
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { MobileHeader } from "@/components/mobile/mobile-header";

/** Call screen "Klara ruft an" (SPEC §8, built in M3). */
export default function CallPage({ params }: PageProps<"/app/call/[callId]">) {
  return (
    <Suspense>
      <Call params={params} />
    </Suspense>
  );
}

async function Call({ params }: { params: PageProps<"/app/call/[callId]">["params"] }) {
  await params;
  return (
    <>
      <MobileHeader title="Gespräch mit Klara" backHref="/app" />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <KlaraAvatar size={112} />
        <p className="text-sm text-muted-foreground">Dieses Gespräch wird aufgezeichnet.</p>
      </main>
    </>
  );
}
