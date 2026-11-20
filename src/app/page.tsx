import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { EntryLinks } from "./entry-links";

export default function Splash() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-surface px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <KlaraAvatar size={104} title="Klara" />
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground">Klara</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
          Meldungen von der Baustelle in jeder Sprache. Deutsche Schreiben nach VOB/B, geprüft und versandbereit.
        </p>
        <EntryLinks />
        <p className="mt-10 text-xs text-muted-foreground">Prototyp mit fiktiven Daten der Muster Bau GmbH.</p>
      </div>
    </main>
  );
}
