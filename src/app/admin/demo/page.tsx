import type { Metadata } from "next";
import { DemoControls } from "./demo-controls";
import { T } from "@/lib/i18n-provider";

export const metadata: Metadata = { title: "Einstellungen" };

export default function DemoPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="text-lg font-semibold text-foreground">
        <T>Einstellungen</T>
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        <T>Für die Vorführung: Ausgangszustand herstellen und die Demo-Uhr stellen.</T>
      </p>
      <DemoControls />
    </main>
  );
}
