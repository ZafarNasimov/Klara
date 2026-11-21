"use client";
// Tiny data hook: fetch JSON, refetch on live changes, and poll slowly as a
// safety net in case the live connection drops during the demo.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveTick } from "./realtime-client";

export type ApiState<T> = {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

export function useApi<T>(url: string | null, opts: { live?: boolean; pollMs?: number } = {}): ApiState<T> {
  const { live = true, pollMs = 20000 } = opts;
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [nonce, setNonce] = useState(0);
  const tick = useLiveTick(live && !!url);
  const seq = useRef(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!url) return;
    const my = ++seq.current;
    const ctrl = new AbortController();
    fetch(url, { cache: "no-store", signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error ?? `Fehler ${r.status}`);
        return body as T;
      })
      .then((d) => {
        if (my !== seq.current) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || my !== seq.current) return;
        setError(e instanceof Error ? e.message : "Laden fehlgeschlagen");
      })
      .finally(() => {
        if (my === seq.current) setLoading(false);
      });
    return () => ctrl.abort();
  }, [url, tick, nonce]);

  useEffect(() => {
    if (!url || !pollMs) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") setNonce((n) => n + 1);
    }, pollMs);
    return () => clearInterval(t);
  }, [url, pollMs]);

  return { data, error, loading, reload };
}

/** A failed API call; 4xx messages are German and meant for the user, 5xx are not. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  return sendJson<T>("POST", url, body);
}

export async function sendJson<T>(method: "POST" | "PATCH", url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(out?.error ?? `Fehler ${r.status}`, r.status);
  return out as T;
}
