"use client";
// Live updates for the UI. One shared subscription per tab:
//  - Supabase Realtime on new `event` rows when the server writes to Supabase
//    (/api/realtime/config) and NEXT_PUBLIC_SUPABASE_* is set
//  - otherwise, or when that channel fails, Server-Sent Events from /api/realtime
// Consumers get a counter that increments on every change; also after a
// reconnect and when the tab becomes visible again (a locked phone catches up).
import { useEffect, useState } from "react";

type Listener = () => void;
const listeners = new Set<Listener>();
let teardown: (() => void) | null = null;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  // Coalesce bursts (one agent turn writes several rows).
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    listeners.forEach((l) => l());
  }, 120);
}

function connectSse(): () => void {
  let es: EventSource | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  const open = () => {
    if (closed) return;
    es = new EventSource("/api/realtime");
    es.onmessage = () => notify();
    es.onerror = () => {
      es?.close();
      if (!closed) retry = setTimeout(open, 2000);
    };
  };
  open();
  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    es?.close();
  };
}

/** Supabase Realtime; calls `onFail` once if the channel cannot be joined. */
function connectSupabase(url: string, anonKey: string, onFail: () => void): () => void {
  let cleanup: (() => void) | null = null;
  let cancelled = false;
  let joined = false;
  void import("@supabase/supabase-js")
    .then(({ createClient }) => {
      if (cancelled) return;
      const sb = createClient(url, anonKey, { auth: { persistSession: false } });
      const channel = sb
        .channel("klara-events")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "event" }, () => notify())
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            // Back after a dropped connection: fetch what was missed.
            if (joined) notify();
            joined = true;
          } else if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !joined && !cancelled) {
            cancelled = true;
            void sb.removeChannel(channel);
            onFail();
          }
        });
      cleanup = () => void sb.removeChannel(channel);
    })
    .catch(() => {
      if (!cancelled) onFail();
    });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}

function onVisible() {
  if (document.visibilityState === "visible") notify();
}

function ensureConnected() {
  if (teardown) return;
  let current: (() => void) | null = null;
  let stopped = false;
  const sse = () => {
    if (!stopped) current = connectSse();
  };
  document.addEventListener("visibilitychange", onVisible);
  teardown = () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisible);
    current?.();
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return sse();
  // Ask the server: a local memory server with the Supabase keys set would never notify through Supabase.
  fetch("/api/realtime/config", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((c: { channel?: string } | null) => {
      if (stopped) return;
      // Tolerate the REST endpoint pasted as the project URL.
      if (c?.channel === "supabase") current = connectSupabase(url.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, ""), key, sse);
      else sse();
    })
    .catch(sse);
}

export function subscribeLive(l: Listener): () => void {
  listeners.add(l);
  ensureConnected();
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && teardown) {
      teardown();
      teardown = null;
    }
  };
}

/** Increments whenever the backend reports a change. */
export function useLiveTick(enabled = true): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    return subscribeLive(() => setTick((t) => t + 1));
  }, [enabled]);
  return tick;
}
