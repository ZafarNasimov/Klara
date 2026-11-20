import "server-only";
import { memoryStore } from "./memory-store";
import { dataBackend, type Store } from "./store";
import { supabaseStore } from "./supabase-store";

export function store(): Store {
  return dataBackend() === "supabase" ? supabaseStore : memoryStore;
}
