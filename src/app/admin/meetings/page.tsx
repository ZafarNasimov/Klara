import type { Metadata } from "next";

export const metadata: Metadata = { title: "Besprechungen" };

/** Meeting upload → protocol (SPEC §8, Should). */
export default function MeetingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="text-lg font-semibold text-foreground">Besprechungen</h1>
      <p className="mt-1 text-sm text-muted-foreground">Audio einer Baubesprechung hochladen, Klara erstellt das Protokoll.</p>
    </main>
  );
}
