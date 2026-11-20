"use client";
// Live updates for the UI. One shared subscription per tab:
//  - Supabase Realtime on new `event` rows when NEXT_PUBLIC_SUPABASE_* is set
//  - otherwise Server-Sent Events from /api/realtime
// Consumers get a counter that increments on every change.
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

function connectSupabase(url: string, anonKey: string): () => void {
  let cleanup: (() => void) | null = null;
  let cancelled = false;
  void import("@supabase/supabase-js").then(({ createClient }) => {
    if (cancelled) return;
    const sb = createClient(url, anonKey, { auth: { persistSession: false } });
    const channel = sb
      .channel("klara-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "event" }, () => notify())
      .subscribe();
    cleanup = () => void sb.removeChannel(channel);
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
}

function ensureConnected() {
  if (teardown) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Tolerate the REST endpoint pasted as the project URL.
  teardown = url && key ? connectSupabase(url.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, ""), key) : connectSse();
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
