import { DemoControls } from "./demo-controls";

export default function DemoPage() {
  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-xl font-semibold text-foreground">Demo-Steuerung</h1>
      <p className="mt-1 text-sm text-muted-foreground">Nur für die Vorführung. Setzt Daten zurück und steuert die Demo-Uhr.</p>
      <DemoControls />
    </main>
  );
}
