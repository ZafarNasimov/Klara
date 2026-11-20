import Link from "next/link";
import { HardHat, LayoutDashboard } from "lucide-react";
import { KlaraAvatar } from "@/components/klara/klara-avatar";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-muted px-4 py-16">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <KlaraAvatar size={112} />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">Klara</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Melden Sie Ereignisse auf der Baustelle in Ihrer Sprache. Klara schreibt das deutsche
          Schreiben, die Bauleitung prüft und versendet.
        </p>
        <nav className="mt-10 grid w-full gap-3">
          <Link
            href="/app"
            className="flex h-14 items-center gap-3 rounded-xl border border-border bg-background px-4 text-left text-base font-medium text-foreground outline-none hover:border-zinc-300 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HardHat className="size-5 text-primary" aria-hidden />
            Baustelle öffnen
            <span className="ml-auto text-sm font-normal text-muted-foreground">Polier</span>
          </Link>
          <Link
            href="/admin"
            className="flex h-14 items-center gap-3 rounded-xl border border-border bg-background px-4 text-left text-base font-medium text-foreground outline-none hover:border-zinc-300 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LayoutDashboard className="size-5 text-primary" aria-hidden />
            Vorgänge prüfen
            <span className="ml-auto text-sm font-normal text-muted-foreground">Bauleitung, Büro</span>
          </Link>
        </nav>
      </div>
    </main>
  );
}
