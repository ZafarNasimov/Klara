"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, FileAudio, Loader2, Mail, Mic, Pause, Play, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/labels";
import { fmtClock, PROCESSING_STEP_DE, PROCESSING_STEPS, type MailDraft, type MeetingView } from "@/lib/meetings/model";
import { ApiError, postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { MeetingDetail } from "./meeting-detail";

export function MeetingScreen({ id }: { id: string }) {
  const [processing, setProcessing] = useState(false);
  const { data: m, error, reload } = useApi<MeetingView>(`/api/meetings/${id}`, { pollMs: processing ? 1000 : 20000 });
  // Poll every second while Klara works (derived during render, no effect).
  const isProcessing = m?.status === "processing";
  if (m && isProcessing !== processing) setProcessing(isProcessing);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-6">
      <Link href="/admin/meetings" className="inline-flex items-center gap-1 rounded text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronLeft className="size-4" aria-hidden /> Besprechungen
      </Link>
      <div className="mt-4">
        {error ? (
          <p className="rounded-xl border border-border bg-background px-5 py-4 text-sm text-foreground">Besprechung nicht gefunden: {error}</p>
        ) : !m ? (
          <Skeleton className="h-64 w-full" />
        ) : m.status === "recording" ? (
          <Recorder m={m} onChanged={reload} />
        ) : m.status === "processing" ? (
          <Processing m={m} />
        ) : m.status === "failed" ? (
          <Failed m={m} onChanged={reload} />
        ) : (
          <MeetingDetail m={m} actions={<ProtocolButton m={m} onChanged={reload} />} />
        )}
      </div>
    </main>
  );
}

// ── Recording ────────────────────────────────────────────────────────────

const CHUNK_MS = 5000;

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

function Recorder({ m, onChanged }: { m: MeetingView; onChanged: () => void }) {
  const autostart = useSearchParams().get("start") === "1";
  const [phase, setPhase] = useState<"idle" | "recording" | "paused" | "ending">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const seq = useRef(0);
  const uploads = useRef<Promise<unknown>>(Promise.resolve());
  const clock = useRef({ startedAt: 0, pausedAt: 0, pausedMs: 0 });

  const cleanup = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
  }, []);
  useEffect(() => cleanup, [cleanup]);

  // Timer and level meter while recording.
  useEffect(() => {
    if (phase !== "recording") return;
    const t = window.setInterval(() => {
      const c = clock.current;
      setElapsed(Math.floor((Date.now() - c.startedAt - c.pausedMs) / 1000));
    }, 250);
    return () => window.clearInterval(t);
  }, [phase]);

  const start = useCallback(async () => {
    if (rec.current && rec.current.state !== "inactive") return;
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const mime = pickMime();
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      r.ondataavailable = (e) => {
        if (!e.data.size) return;
        const n = seq.current++;
        uploads.current = uploads.current.then(() =>
          fetch(`/api/meetings/${m.id}/audio?seq=${n}`, { method: "POST", headers: { "content-type": e.data.type || mime || "audio/webm" }, body: e.data }).then((res) => {
            if (!res.ok) throw new Error("Upload fehlgeschlagen");
          }),
        );
        uploads.current.catch(() => setError("Ein Teil der Aufnahme konnte nicht hochgeladen werden. Bitte Verbindung prüfen."));
      };
      r.start(CHUNK_MS);
      rec.current = r;
      clock.current = { startedAt: Date.now(), pausedAt: 0, pausedMs: 0 };
      setPhase("recording");

      // A simple level meter (RMS of the mic signal).
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const loop = () => {
        if (!audioCtx.current) return;
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch {
      setError("Kein Zugriff auf das Mikrofon. Erlauben Sie das Mikrofon im Browser oder nutzen Sie „Audio hochladen“.");
      setPhase("idle");
    }
  }, [m.id]);

  // Started from "Meeting starten": begin right away. A timer the cleanup
  // cancels, so React's dev double mount starts the recorder exactly once.
  useEffect(() => {
    if (!autostart) return;
    const t = window.setTimeout(() => void start(), 0);
    return () => window.clearTimeout(t);
  }, [autostart, start]);

  function togglePause() {
    const r = rec.current;
    if (!r) return;
    if (phase === "recording") {
      r.pause();
      clock.current.pausedAt = Date.now();
      setPhase("paused");
    } else if (phase === "paused") {
      r.resume();
      clock.current.pausedMs += Date.now() - clock.current.pausedAt;
      setPhase("recording");
    }
  }

  async function end() {
    const r = rec.current;
    if (!r) return;
    setPhase("ending");
    await new Promise<void>((resolve) => {
      r.addEventListener("stop", () => resolve(), { once: true });
      r.stop();
    });
    cleanup();
    try {
      await uploads.current;
      await postJson(`/api/meetings/${m.id}/end`, { duration_sec: elapsed });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Die Aufnahme konnte nicht abgeschlossen werden.");
      setPhase("idle");
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="font-mono text-xs text-muted-foreground">{m.ref}</p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">{m.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{m.participants.map((p) => p.name).join(", ") || "Keine Teilnehmer angegeben"}</p>
      </header>

      <section aria-label="Aufnahme" className="flex flex-col items-center gap-5 rounded-xl border border-border bg-background px-6 py-10">
        <p className="font-mono text-4xl tracking-tight text-foreground tabular-nums" aria-live="off">
          {fmtClock(elapsed)}
        </p>
        <LevelMeter level={phase === "recording" ? level : 0} />
        <p className="text-sm text-muted-foreground" role="status">
          {phase === "recording" ? "Aufnahme läuft" : phase === "paused" ? "Pausiert" : phase === "ending" ? "Aufnahme wird abgeschlossen …" : "Bereit"}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {phase === "idle" ? (
            <Button size="lg" onClick={start}>
              <Mic aria-hidden /> Aufnahme starten
            </Button>
          ) : (
            <>
              <Button size="lg" variant="outline" onClick={togglePause} disabled={phase === "ending"}>
                {phase === "paused" ? <Play aria-hidden /> : <Pause aria-hidden />}
                {phase === "paused" ? "Fortsetzen" : "Pause"}
              </Button>
              <Button size="lg" onClick={end} disabled={phase === "ending"}>
                {phase === "ending" ? <Loader2 className="animate-spin" aria-hidden /> : <Square aria-hidden />}
                Meeting beenden
              </Button>
            </>
          )}
        </div>
        {error ? (
          <p className="max-w-md text-center text-sm text-light-red-text" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {phase === "idle" ? <Fallbacks m={m} onChanged={onChanged} /> : null}
    </div>
  );
}

function LevelMeter({ level }: { level: number }) {
  const bars = 7;
  return (
    <div className="flex h-8 items-end gap-1" aria-hidden>
      {Array.from({ length: bars }, (_, i) => {
        const center = 1 - Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
        const h = 0.15 + level * (0.4 + 0.6 * center);
        return <span key={i} className="w-1.5 rounded-full bg-primary/70" style={{ height: `${Math.min(1, h) * 100}%` }} />;
      })}
    </div>
  );
}

/** Offline / demo: upload a file, or replay the sample meeting through the real pipeline. */
function Fallbacks({ m, onChanged }: { m: MeetingView; onChanged: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "sample" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(f: File) {
    setBusy("upload");
    setError(null);
    try {
      if (f.size > 4_000_000) throw new Error("Die Datei ist zu groß (max. 4 MB). Bitte eine kürzere oder komprimierte Aufnahme wählen.");
      const res = await fetch(`/api/meetings/${m.id}/audio?seq=0`, { method: "POST", headers: { "content-type": f.type || "audio/webm" }, body: f });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Upload fehlgeschlagen");
      await postJson(`/api/meetings/${m.id}/end`, {});
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fehlgeschlagen");
      setBusy(null);
    }
  }

  async function sample() {
    setBusy("sample");
    setError(null);
    try {
      await postJson(`/api/meetings/sample`, { meeting_id: m.id });
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Fehlgeschlagen");
      setBusy(null);
    }
  }

  return (
    <section aria-label="Ohne Mikrofon" className="rounded-xl border border-border bg-background px-5 py-4">
      <h2 className="text-sm font-semibold text-foreground">Ohne Mikrofon</h2>
      <p className="mt-1 text-sm text-muted-foreground">Eine vorhandene Aufnahme auswerten, oder die Beispielaufnahme (MT-2026-0007) durch die echte Auswertung schicken.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input ref={file} type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button variant="outline" onClick={() => file.current?.click()} disabled={!!busy}>
          {busy === "upload" ? <Loader2 className="animate-spin" aria-hidden /> : <FileAudio aria-hidden />} Audio hochladen
        </Button>
        <Button variant="outline" onClick={sample} disabled={!!busy}>
          {busy === "sample" ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} Beispielaufnahme verwenden
        </Button>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-light-red-text" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

// ── Processing / failed ──────────────────────────────────────────────────

function Processing({ m }: { m: MeetingView }) {
  const current = PROCESSING_STEPS.find((s) => !m.steps[s]);
  return (
    <section aria-label="Auswertung" className="rounded-xl border border-border bg-background px-6 py-6">
      <p className="font-mono text-xs text-muted-foreground">{m.ref}</p>
      <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">{m.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Klara wertet die Besprechung aus.</p>
      <ol className="mt-5 space-y-3" aria-live="polite">
        {PROCESSING_STEPS.map((s) => {
          const done = m.steps[s];
          const active = s === current;
          return (
            <li key={s} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border",
                  done ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary text-primary" : "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : active ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              </span>
              <span className={done || active ? "text-foreground" : "text-muted-foreground"}>{PROCESSING_STEP_DE[s]}</span>
              <span className="sr-only">{done ? "erledigt" : active ? "läuft" : "wartet"}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Failed({ m, onChanged }: { m: MeetingView; onChanged: () => void }) {
  return (
    <div className="space-y-5">
      <section role="alert" className="rounded-xl border border-border bg-background px-6 py-5">
        <p className="font-mono text-xs text-muted-foreground">{m.ref}</p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">{m.title}</h1>
        <p className="mt-2 text-sm text-light-red-text">Auswertung fehlgeschlagen: {m.error ?? "unbekannter Fehler"}</p>
        <p className="mt-1 text-sm text-muted-foreground">Die Aufnahme bleibt gespeichert. Es wurde nichts angelegt oder geändert.</p>
      </section>
      <Fallbacks m={m} onChanged={onChanged} />
    </div>
  );
}

// ── Protocol e-mail (draft; a person confirms) ───────────────────────────

function ProtocolButton({ m, onChanged }: { m: MeetingView; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const sent = m.mail?.status === "versendet";
  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <Button variant={sent ? "outline" : "default"} onClick={() => setOpen(true)}>
          <Mail aria-hidden /> {sent ? "Protokoll ansehen" : "Protokoll an Teilnehmer senden"}
        </Button>
        {sent && m.mail?.sent_at ? (
          <p className="text-xs text-muted-foreground">
            {m.mail.simulated ? "Testversand" : "Versendet"} am {fmtDateTime(m.mail.sent_at)}
          </p>
        ) : null}
      </div>
      {open ? <ProtocolDialog m={m} onClose={() => setOpen(false)} onSent={onChanged} /> : null}
    </>
  );
}

function ProtocolDialog({ m, onClose, onSent }: { m: MeetingView; onClose: () => void; onSent: () => void }) {
  const { data: draft, error: loadError } = useApi<MailDraft>(`/api/meetings/${m.id}/mail`, { live: false, pollMs: 0 });
  const [to, setTo] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = draft?.status === "versendet";

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/meetings/${m.id}/mail`, {
        confirm: true,
        to: (to ?? draft?.to.join(", ") ?? "").split(/[,;\s]+/).filter(Boolean),
        subject: subject ?? draft?.subject ?? "",
        body: body ?? draft?.body ?? "",
      });
      onSent();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Versand fehlgeschlagen");
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Protokoll an Teilnehmer</DialogTitle>
          <DialogDescription>{sent ? "Bereits versendet." : "Entwurf. Es wird erst versendet, wenn Sie auf „Senden“ klicken."}</DialogDescription>
        </DialogHeader>
        {loadError ? (
          <p className="text-sm text-light-red-text">{loadError}</p>
        ) : !draft ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-foreground">An</span>
              <Input value={to ?? draft.to.join(", ")} onChange={(e) => setTo(e.target.value)} disabled={sent} placeholder="E-Mail-Adressen, durch Komma getrennt" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-foreground">Betreff</span>
              <Input value={subject ?? draft.subject} onChange={(e) => setSubject(e.target.value)} disabled={sent} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-foreground">Text</span>
              <Textarea value={body ?? draft.body} onChange={(e) => setBody(e.target.value)} disabled={sent} rows={14} className="font-mono text-xs" />
            </label>
            {error ? (
              <p className="text-sm text-light-red-text" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {sent ? "Schließen" : "Abbrechen"}
          </Button>
          {!sent ? (
            <Button onClick={send} disabled={busy || !draft}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />} Senden
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
