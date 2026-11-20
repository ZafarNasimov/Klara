// Picks the storage backend. DATA_BACKEND=memory|supabase; default: Supabase
// when its server credentials are set, otherwise the in-memory store.
import "server-only";
import { timed } from "@/lib/timing";
import { memoryStore } from "./memory-store";
import type { Store } from "./store";
import { supabaseStore } from "./supabase-store";

export function dataBackend(): "memory" | "supabase" {
  const explicit = process.env.DATA_BACKEND;
  if (explicit === "memory" || explicit === "supabase") return explicit;
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "memory";
}

/**
 * Every store call counts toward the "db" step of the request timing (wall
 * time with at least one call in flight, plus the number of calls).
 * `TIMING_DB_DETAIL=1` splits it per operation and table. `DB_SIMULATED_LATENCY_MS`
 * delays each memory-store call, to measure round trips without touching Supabase.
 */
function timedStore(s: Store): Store {
  const step = (op: string, table: string) => (process.env.TIMING_DB_DETAIL ? `db.${op}.${table}` : "db");
  const delay = async () => {
    const ms = s.backend === "memory" ? Number(process.env.DB_SIMULATED_LATENCY_MS) || 0 : 0;
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
  };
  const call = <T>(op: string, table: string, fn: () => Promise<T>) =>
    timed(
      step(op, table),
      async () => {
        await delay();
        return fn();
      },
      { overlap: "wall" },
    );
  return {
    backend: s.backend,
    list: (table, query) => call("list", table, () => s.list(table, query)),
    get: (table, id) => call("get", table, () => s.get(table, id)),
    insert: (table, row) => call("insert", table, () => s.insert(table, row)),
    update: (table, id, patch) => call("update", table, () => s.update(table, id, patch)),
    reset: (data) => s.reset(data),
    isEmpty: () => s.isEmpty(),
  };
}

const stores = { supabase: timedStore(supabaseStore), memory: timedStore(memoryStore) };

export function store(): Store {
  return stores[dataBackend()];
}

export type { Store } from "./store";
