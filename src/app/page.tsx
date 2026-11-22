import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { EntryLinks } from "./entry-links";
import { LangSwitch, T } from "@/lib/i18n-provider";

export default function Splash() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-surface px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <KlaraAvatar size={104} title="Klara" />
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground">Klara</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
          <T>Meldungen von der Baustelle in jeder Sprache. Deutsche Schreiben nach VOB/B, geprüft und versandbereit.</T>
        </p>
        <EntryLinks />
        <LangSwitch size="lg" className="mt-8" />
        <p className="mt-6 text-xs text-muted-foreground">
          <T>Prototyp mit fiktiven Daten der Muster Bau GmbH.</T>
        </p>
      </div>
    </main>
  );
}
