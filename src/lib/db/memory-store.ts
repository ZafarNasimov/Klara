import "server-only";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import type { TableName, Tables } from "@/lib/types";
import { buildSeed, type SeedData } from "./seed";
import type { ListOptions, Store } from "./store";

type MemoryState = { data: SeedData; bus: EventEmitter };

const PERSIST_FILE = path.join(process.cwd(), ".data", "db.json");
const persist = process.env.MEMORY_PERSIST !== "0" && process.env.NODE_ENV !== "test";

const g = globalThis as unknown as { __klaraMemory?: MemoryState };

function load(): SeedData {
  if (persist) {
    try {
      const raw = fs.readFileSync(PERSIST_FILE, "utf8");
      const parsed = JSON.parse(raw) as SeedData;
      // Make sure tables added after the file was written exist.
      const fresh = buildSeed();
      for (const k of Object.keys(fresh) as TableName[]) {
        if (!parsed[k]) (parsed as Record<string, unknown>)[k] = fresh[k];
      }
      return parsed;
    } catch {
      /* fall through to a fresh seed */
    }
  }
  return buildSeed();
}

function state(): MemoryState {
  if (!g.__klaraMemory) {
    const bus = new EventEmitter();
    bus.setMaxListeners(100);
    g.__klaraMemory = { data: load(), bus };
  }
  return g.__klaraMemory;
}

let writeTimer: NodeJS.Timeout | null = null;
function save() {
  if (!persist) return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(PERSIST_FILE), { recursive: true });
      fs.writeFileSync(PERSIST_FILE, JSON.stringify(state().data, null, 1));
    } catch (e) {
      console.warn("[memory-store] could not persist", e);
    }
  }, 50);
}

const clone = <T,>(v: T): T => structuredClone(v);

function matches<T>(row: T, where?: Partial<T>): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => (row as Record<string, unknown>)[k] === v);
}

/** Subscribe to row inserts/updates (used by the SSE realtime fallback). */
export function memoryBus(): EventEmitter {
  return state().bus;
}

export const memoryStore: Store = {
  kind: "memory",
  async list<K extends TableName>(table: K, opts: ListOptions<Tables[K]> = {}) {
    let rows = (state().data[table] as Tables[K][]).filter((r) => matches(r, opts.where));
    if (opts.orderBy) {
      const { column, ascending = true } = opts.orderBy;
      rows = [...rows].sort((a, b) => {
        const av = a[column] as unknown as string | number;
        const bv = b[column] as unknown as string | number;
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (ascending ? 1 : -1);
      });
    }
    if (opts.limit) rows = rows.slice(0, opts.limit);
    return clone(rows);
  },
  async get<K extends TableName>(table: K, id: string) {
    const row = (state().data[table] as Array<Tables[K] & { id: string }>).find((r) => r.id === id);
    return row ? clone(row) : null;
  },
  async insert<K extends TableName>(table: K, row: Tables[K]) {
    (state().data[table] as Tables[K][]).push(clone(row));
    save();
    state().bus.emit("change", { table, type: "INSERT", row: clone(row) });
    return clone(row);
  },
  async update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>) {
    const rows = state().data[table] as Array<Tables[K] & { id: string }>;
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error(`${table} ${id} not found`);
    rows[idx] = { ...rows[idx], ...clone(patch) };
    save();
    state().bus.emit("change", { table, type: "UPDATE", row: clone(rows[idx]) });
    return clone(rows[idx]);
  },
  async reset(seed: SeedData) {
    state().data = clone(seed);
    save();
    state().bus.emit("change", { table: "event", type: "RESET", row: null });
  },
};
