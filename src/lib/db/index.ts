// Picks the storage backend. DATA_BACKEND=memory|supabase; default: Supabase
// when its server credentials are set, otherwise the in-memory store.
import "server-only";
import { memoryStore } from "./memory-store";
import type { Store } from "./store";
import { supabaseStore } from "./supabase-store";

export function dataBackend(): "memory" | "supabase" {
  const explicit = process.env.DATA_BACKEND;
  if (explicit === "memory" || explicit === "supabase") return explicit;
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "memory";
}

export function store(): Store {
  return dataBackend() === "supabase" ? supabaseStore : memoryStore;
}

export type { Store } from "./store";
