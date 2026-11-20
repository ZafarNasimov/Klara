"use client";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/use-api";

export function DemoControls() {
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    setBusy(true);
    try {
      await postJson("/api/demo/reset");
      toast.success("Demo zurückgesetzt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Zurücksetzen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-6 rounded-lg border border-border bg-background p-5">
      <h2 className="text-base font-semibold text-foreground">Ausgangszustand</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Löscht alle Vorgänge, Gespräche und E-Mails und lädt die Projektdaten neu.
      </p>
      <Button className="mt-4" size="lg" onClick={reset} disabled={busy}>
        <RotateCcw aria-hidden />
        {busy ? "Wird zurückgesetzt…" : "Demo zurücksetzen"}
      </Button>
    </section>
  );
}
