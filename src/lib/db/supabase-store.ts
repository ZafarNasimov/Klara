// Supabase backend (Postgres through PostgREST, service role key, server only).
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TABLE_ORDER, type TableName } from "@/lib/types";
import { NotFoundError, type Row, type Store } from "./store";

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

// Postgres returns timestamptz as "2026-11-20T06:00:00.123456+00:00"; the app
// (and the memory backend) use JS ISO strings. Normalize so sorting and
// comparisons behave the same on both backends.
const PG_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}$/;

function normalize<T>(row: T): T {
  const out = { ...(row as Record<string, unknown>) };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "string" && PG_TS.test(v)) out[k] = new Date(v).toISOString();
  }
  return out as T;
}

function fail(table: string, op: string, error: { message: string } | null): never {
  throw new Error(`Supabase ${op} ${table}: ${error?.message ?? "unbekannter Fehler"}`);
}

export const supabaseStore: Store = {
  backend: "supabase",

  async list(table, query = {}) {
    let q = db().from(table).select("*");
    for (const [k, v] of Object.entries(query.where ?? {})) {
      q = v === null ? q.is(k, null) : q.eq(k, v as string | number | boolean);
    }
    if (query.order) q = q.order(query.order.column, { ascending: query.order.ascending ?? true });
    if (query.limit !== undefined) q = q.limit(query.limit);
    const { data, error } = await q;
    if (error) fail(table, "list", error);
    return (data ?? []).map((r) => normalize(r as Row<typeof table>));
  },

  async get(table, id) {
    const { data, error } = await db().from(table).select("*").eq("id", id).maybeSingle();
    if (error) fail(table, "get", error);
    return data ? normalize(data as Row<typeof table>) : null;
  },

  async insert(table, row) {
    const { data, error } = await db().from(table).insert(row as never).select("*").single();
    if (error) fail(table, "insert", error);
    return normalize(data as Row<typeof table>);
  },

  async update(table, id, patch) {
    const { data, error } = await db().from(table).update(patch as never).eq("id", id).select("*").maybeSingle();
    if (error) fail(table, "update", error);
    if (!data) throw new NotFoundError(table, id);
    return normalize(data as Row<typeof table>);
  },

  async reset(data) {
    for (const t of [...TABLE_ORDER].reverse()) {
      const { error } = await db().from(t).delete().not("id", "is", null);
      if (error) fail(t, "reset", error);
    }
    for (const t of TABLE_ORDER) {
      const rows = data[t as TableName];
      if (!rows?.length) continue;
      const { error } = await db().from(t).insert(rows as never[]);
      if (error) fail(t, "seed", error);
    }
  },

  async isEmpty() {
    const { count, error } = await db().from("project").select("id", { count: "exact", head: true });
    if (error) fail("project", "count", error);
    return !count;
  },
};
