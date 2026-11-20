// Storage abstraction. Two backends share one tiny table-level interface:
// - "memory": seeded in-process store for local dev and offline demos
// - "supabase": Postgres via service-role client (SPEC §2)
// Domain logic lives in repo.ts and never talks to a backend directly.
import "server-only";
import type { TableName, Tables } from "@/lib/types";
import type { SeedData } from "./seed";

export type ListOptions<T> = {
  where?: Partial<T>;
  orderBy?: { column: keyof T & string; ascending?: boolean };
  limit?: number;
};

export interface Store {
  readonly kind: "memory" | "supabase";
  list<K extends TableName>(table: K, opts?: ListOptions<Tables[K]>): Promise<Tables[K][]>;
  get<K extends TableName>(table: K, id: string): Promise<Tables[K] | null>;
  insert<K extends TableName>(table: K, row: Tables[K]): Promise<Tables[K]>;
  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>): Promise<Tables[K]>;
  reset(seed: SeedData): Promise<void>;
}

export function dataBackend(): "memory" | "supabase" {
  const v = process.env.DATA_BACKEND;
  if (v === "supabase") return "supabase";
  if (v === "memory") return "memory";
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "memory";
}
