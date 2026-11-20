import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TableName, Tables } from "@/lib/types";
import type { SeedData } from "./seed";
import type { ListOptions, Store } from "./store";

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

function fail(table: string, error: { message: string } | null): never {
  throw new Error(`[supabase] ${table}: ${error?.message ?? "unknown error"}`);
}

// Insert order respects foreign keys; delete order is the reverse.
const TABLE_ORDER: TableName[] = [
  "company", "project", "app_user", "team", "contact", "trade", "schedule_item", "progress_entry",
  "conversation", "turn", "case", "document_version", "evidence", "email_out", "email_in",
  "daily_report", "meeting", "event",
];

export const supabaseStore: Store = {
  kind: "supabase",
  async list<K extends TableName>(table: K, opts: ListOptions<Tables[K]> = {}) {
    let q = sb().from(table).select("*");
    for (const [k, v] of Object.entries(opts.where ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v);
    if (opts.orderBy) q = q.order(opts.orderBy.column, { ascending: opts.orderBy.ascending ?? true });
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) fail(table, error);
    return (data ?? []) as Tables[K][];
  },
  async get<K extends TableName>(table: K, id: string) {
    const { data, error } = await sb().from(table).select("*").eq("id", id).maybeSingle();
    if (error) fail(table, error);
    return (data as Tables[K]) ?? null;
  },
  async insert<K extends TableName>(table: K, row: Tables[K]) {
    const { data, error } = await sb().from(table).insert(row).select("*").single();
    if (error) fail(table, error);
    return data as Tables[K];
  },
  async update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>) {
    const { data, error } = await sb().from(table).update(patch as never).eq("id", id).select("*").single();
    if (error) fail(table, error);
    return data as Tables[K];
  },
  async reset(seed: SeedData) {
    for (const table of [...TABLE_ORDER].reverse()) {
      const { error } = await sb().from(table).delete().not("id", "is", null);
      if (error) fail(table, error);
    }
    for (const table of TABLE_ORDER) {
      const rows = seed[table];
      if (!rows.length) continue;
      const { error } = await sb().from(table).insert(rows as never);
      if (error) fail(table, error);
    }
  },
};
