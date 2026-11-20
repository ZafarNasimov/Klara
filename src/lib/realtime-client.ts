"use client";
// Live updates for the admin panel and the Polier feed.
// Supabase Realtime when NEXT_PUBLIC_SUPABASE_* is set, otherwise SSE from /api/realtime.
import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type LiveChange = { table: string; type: string; row: unknown };

export function useLive(onChange: (c: LiveChange) => void) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });

  useEffect(() => {
    if (SB_URL && SB_KEY) {
      const sb = createClient(SB_URL, SB_KEY);
      const ch = sb
        .channel("klara-events")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "event" }, (p) =>
          cb.current({ table: "event", type: "INSERT", row: p.new }),
        )
        .subscribe();
      return () => {
        sb.removeChannel(ch);
      };
    }
    const es = new EventSource("/api/realtime");
    es.onmessage = (m) => {
      try {
        const data = JSON.parse(m.data) as LiveChange;
        if (data.type === "PING" || data.type === "HELLO") return;
        cb.current(data);
      } catch {}
    };
    return () => es.close();
  }, []);
}
