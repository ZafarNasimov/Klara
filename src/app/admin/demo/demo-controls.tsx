"use client";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectContext } from "@/lib/db/repo";
import { fmtDateTime } from "@/lib/labels";
import { postJson, useApi } from "@/lib/use-api";
import type { VadSettings } from "@/lib/voice/types";

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

      {data ? <VadSettingsForm key={JSON.stringify(data.project.settings.vad ?? null)} initial={data.project.settings.vad ?? DEFAULT_VAD} onSaved={reload} /> : null}

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

const DEFAULT_VAD: VadSettings = { silence_ms: 800, min_speech_ms: 400, positive_threshold: 0.5 };

/** Hands-free tuning for the call screen (SPEC M3). Takes effect on the next call. */
function VadSettingsForm({ initial, onSaved }: { initial: VadSettings; onSaved: () => void }) {
  const [v, setV] = useState({ silence_ms: String(initial.silence_ms), min_speech_ms: String(initial.min_speech_ms), positive_threshold: String(initial.positive_threshold) });
  const [saving, setSaving] = useState(false);
  const num = (s: string) => Number(s.replace(",", "."));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await postJson("/api/demo/vad", { silence_ms: num(v.silence_ms), min_speech_ms: num(v.min_speech_ms), positive_threshold: num(v.positive_threshold) });
      toast.success("Freihändig-Einstellungen gespeichert");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };
  const fields = [
    { key: "silence_ms", label: "Pause bis Sprechende", unit: "ms", hint: "So lange Stille, dann sendet Klara. Standard 800." },
    { key: "min_speech_ms", label: "Mindestlänge", unit: "ms", hint: "Kürzere Geräusche werden ignoriert. Standard 400." },
    { key: "positive_threshold", label: "Sprachschwelle", unit: "0–1", hint: "In einer lauten Halle erhöhen. Standard 0,5." },
  ] as const;
  return (
    <section className="rounded-xl border border-border bg-background p-5">
      <h2 className="text-sm font-medium text-foreground">Freihändig sprechen</h2>
      <p className="mt-1 text-sm text-muted-foreground">Wann Klara erkennt, dass der Polier fertig gesprochen hat. Gilt ab dem nächsten Anruf.</p>
      <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={`vad-${f.key}`} className="text-sm font-medium text-foreground">
              {f.label} <span className="font-normal text-muted-foreground">({f.unit})</span>
            </label>
            <Input
              id={`vad-${f.key}`}
              inputMode="decimal"
              value={v[f.key]}
              onChange={(e) => setV((x) => ({ ...x, [f.key]: e.target.value }))}
              aria-describedby={`vad-${f.key}-hint`}
              className="mt-1 h-10 font-mono"
            />
            <p id={`vad-${f.key}-hint`} className="mt-1 text-xs text-muted-foreground">
              {f.hint}
            </p>
          </div>
        ))}
        <div className="sm:col-span-3">
          <Button type="submit" variant="outline" className="h-10 px-4" disabled={saving}>
            {saving ? "Wird gespeichert…" : "Speichern"}
          </Button>
        </div>
      </form>
    </section>
  );
}
