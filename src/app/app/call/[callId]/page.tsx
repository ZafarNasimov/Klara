import { Suspense } from "react";
import { MobileHeader } from "@/components/mobile/mobile-header";
import { KlaraAvatar } from "@/components/klara/klara-avatar";

// M3 builds the full call screen (voice, VAD, push-to-talk). Placeholder shell for now.
export default function CallPage({ params }: { params: Promise<{ callId: string }> }) {
  return (
    <Suspense>
      <CallShell params={params} />
    </Suspense>
  );
}

async function CallShell({ params }: { params: Promise<{ callId: string }> }) {
  await params;
  return (
    <>
      <MobileHeader title="Klara ruft an" backHref="/app" />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <KlaraAvatar size={160} />
        <p className="text-sm text-muted-foreground">Dieses Gespräch wird aufgezeichnet.</p>
        <p className="text-base text-foreground">Sprachanruf folgt in Meilenstein 3. Bis dahin bitte den Text-Chat im Team-Kanal nutzen.</p>
      </main>
    </>
  );
}
