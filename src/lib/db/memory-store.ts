// In-memory store for running Klara without Supabase. One instance per server
// process (kept on globalThis so route handlers and server components share
// it in dev), persisted to .data/db.json so a restart keeps the demo state.
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { clockBase } from "@/lib/clock";
import { TABLE_ORDER, type TableName } from "@/lib/types";
import { withDemoHistory } from "./demo-history";
import { buildSeed } from "./seed";
import { NotFoundError, type Row, type SeedData, type Store, type StoreChange } from "./store";

type Tables = { [K in TableName]: Map<string, Row<K>> };

type MemoryState = {
  tables: Tables;
  bus: EventEmitter;
  loaded: boolean;
  writeTimer: ReturnType<typeof setTimeout> | null;
};

const g = globalThis as unknown as { __klaraMemory?: MemoryState };

function emptyTables(): Tables {
  return Object.fromEntries(TABLE_ORDER.map((t) => [t, new Map()])) as unknown as Tables;
}

function state(): MemoryState {
  if (!g.__klaraMemory) {
    const bus = new EventEmitter();
    bus.setMaxListeners(100);
    g.__klaraMemory = { tables: emptyTables(), bus, loaded: false, writeTimer: null };
  }
  return g.__klaraMemory;
}

function persistPath(): string | null {
  if (process.env.MEMORY_PERSIST === "0") return null;
  // Serverless file systems are read-only except /tmp.
  if (process.env.VERCEL) return "/tmp/klara-db.json";
  return path.join(process.cwd(), ".data", "db.json");
}

/** First access: restore the persisted state, or start from the demo seed. */
function load(s: MemoryState) {
  if (s.loaded) return;
  s.loaded = true;
  const file = persistPath();
  if (file && fs.existsSync(file)) {
    try {
      fill(s, JSON.parse(fs.readFileSync(file, "utf8")) as SeedData);
      return;
    } catch (err) {
      console.warn("[klara] .data/db.json unreadable, loading the demo seed", err);
    }
  }
  const now = clockBase();
  fill(s, withDemoHistory(buildSeed(now), now));
  schedulePersist(s);
}

function fill(s: MemoryState, data: SeedData) {
  s.tables = emptyTables();
  for (const t of TABLE_ORDER) {
    const rows = (data[t] ?? []) as Row<typeof t>[];
    const map = s.tables[t] as Map<string, Row<typeof t>>;
    for (const r of rows) map.set((r as { id: string }).id, structuredClone(r));
  }
}

function schedulePersist(s: MemoryState) {
  const file = persistPath();
  if (!file) return;
  if (s.writeTimer) clearTimeout(s.writeTimer);
  s.writeTimer = setTimeout(() => {
    s.writeTimer = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const out = Object.fromEntries(TABLE_ORDER.map((t) => [t, [...s.tables[t].values()]]));
      fs.writeFileSync(file, JSON.stringify(out));
    } catch (err) {
      console.warn("[klara] could not persist memory store", err);
    }
  }, 150);
}

function emit(s: MemoryState, change: StoreChange) {
  s.bus.emit("change", change);
}

function matches<T extends TableName>(row: Row<T>, where: Partial<Row<T>> | undefined): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if ((row as Record<string, unknown>)[k] !== v) return false;
  }
  return true;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
}

export const memoryStore: Store = {
  backend: "memory",

  async list(table, query = {}) {
    const s = state();
    load(s);
    let rows = [...s.tables[table].values()].filter((r) => matches(r, query.where));
    if (query.order) {
      const { column, ascending = true } = query.order;
      rows.sort((a, b) => {
        const c = compare((a as Record<string, unknown>)[column], (b as Record<string, unknown>)[column]);
        return ascending ? c : -c;
      });
    }
    if (query.limit !== undefined) rows = rows.slice(0, query.limit);
    return rows.map((r) => structuredClone(r));
  },

  async get(table, id) {
    const s = state();
    load(s);
    const row = s.tables[table].get(id);
    return row ? structuredClone(row) : null;
  },

  async insert(table, row) {
    const s = state();
    load(s);
    const copy = structuredClone(row);
    s.tables[table].set((copy as { id: string }).id, copy);
    schedulePersist(s);
    emit(s, { table, id: (copy as { id: string }).id, op: "insert" });
    return structuredClone(copy);
  },

  async update(table, id, patch) {
    const s = state();
    load(s);
    const cur = s.tables[table].get(id);
    if (!cur) throw new NotFoundError(table, id);
    const next = { ...cur, ...structuredClone(patch), id } as typeof cur;
    s.tables[table].set(id, next);
    schedulePersist(s);
    emit(s, { table, id, op: "update" });
    return structuredClone(next);
  },

  async reset(data) {
    const s = state();
    s.loaded = true;
    fill(s, data);
    schedulePersist(s);
    emit(s, { table: "project", id: "*", op: "reset" });
  },

  async isEmpty() {
    const s = state();
    load(s);
    return s.tables.project.size === 0;
  },
};

/** Change feed of the memory store (for the SSE realtime route). */
export function onMemoryChange(listener: (c: StoreChange) => void): () => void {
  const s = state();
  s.bus.on("change", listener);
  return () => s.bus.off("change", listener);
}
