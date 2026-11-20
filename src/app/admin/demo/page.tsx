import type { Metadata } from "next";
import { DemoControls } from "./demo-controls";

export const metadata: Metadata = { title: "Demo" };

export default function DemoPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="text-lg font-semibold text-foreground">Demo-Steuerung</h1>
      <p className="mt-1 text-sm text-muted-foreground">Für die Vorführung: Ausgangszustand herstellen und die Demo-Uhr stellen.</p>
      <DemoControls />
    </main>
  );
}
