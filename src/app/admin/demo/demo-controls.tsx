"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ProjectContext } from "@/lib/db/repo";
import { fmtDateTime } from "@/lib/labels";
import { postJson, useApi } from "@/lib/use-api";

type ProjectResponse = ProjectContext & { now: string; llm_mode: "live" | "mock"; backend: "memory" | "supabase" };

export function DemoControls() {
  const { data, reload } = useApi<ProjectResponse>("/api/project");
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, url: string, body: unknown, done: string) => {
    setBusy(key);
    try {
      await postJson(url, body);
      toast.success(done);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-xl border border-border bg-background p-5">
        <h2 className="text-sm font-medium text-foreground">Demo zurücksetzen</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Löscht alle Vorgänge, Gespräche und E-Mails und lädt die Ausgangsdaten (Muster Bau GmbH, Neubau Bürogebäude München).
        </p>
        <Button className="mt-3 h-10 px-4" disabled={busy !== null} onClick={() => run("reset", "/api/demo/reset", {}, "Demo zurückgesetzt")}>
          {busy === "reset" ? "Wird zurückgesetzt…" : "Demo zurücksetzen"}
        </Button>
      </section>

      <section className="rounded-xl border border-border bg-background p-5">
        <h2 className="text-sm font-medium text-foreground">Demo-Uhr</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Aktuell: <span className="font-mono text-foreground">{data ? fmtDateTime(data.now) : "–"}</span>. Fristen und Zeitstempel richten sich nach dieser Uhr.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" className="h-10 px-4" disabled={busy !== null} onClick={() => run("07", "/api/demo/clock", { set: "07:00" }, "Uhr auf 07:00 gestellt")}>
            Heute 07:00
          </Button>
          <Button variant="outline" className="h-10 px-4" disabled={busy !== null} onClick={() => run("16", "/api/demo/clock", { set: "16:00" }, "Uhr auf 16:00 gestellt")}>
            Heute 16:00
          </Button>
          <Button variant="outline" className="h-10 px-4" disabled={busy !== null} onClick={() => run("day", "/api/demo/clock", { add_minutes: 24 * 60 }, "Einen Tag weiter")}>
            Einen Tag weiter
          </Button>
          <Button variant="ghost" className="h-10 px-4" disabled={busy !== null} onClick={() => run("real", "/api/demo/clock", { set: "real" }, "Echte Uhrzeit")}>
            Echte Uhrzeit
          </Button>
        </div>
      </section>

      {data ? (
        <section className="rounded-xl border border-border bg-background p-5">
          <h2 className="text-sm font-medium text-foreground">Betriebsart</h2>
          <dl className="mt-2 grid grid-cols-[160px_1fr] gap-y-1 text-sm">
            <dt className="text-muted-foreground">Datenhaltung</dt>
            <dd className="text-foreground">{data.backend === "supabase" ? "Supabase" : "Lokal (ohne Supabase)"}</dd>
            <dt className="text-muted-foreground">Sprachmodell</dt>
            <dd className="text-foreground">{data.llm_mode === "live" ? "Claude (live)" : "Testmodus ohne KI-Modell"}</dd>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
