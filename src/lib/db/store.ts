// Storage abstraction. Two backends with the same contract:
//  - memory: in-process, persisted to .data/db.json, for running without keys
//  - supabase: Postgres via the service role key (SPEC §2)
import type { TableName, Tables } from "@/lib/types";

export type Row<T extends TableName> = Tables[T];

export type Query<T extends TableName> = {
  /** Equality filters on scalar columns. */
  where?: Partial<Row<T>>;
  order?: { column: keyof Row<T> & string; ascending?: boolean };
  limit?: number;
};

export type SeedData = { [K in TableName]?: Tables[K][] };

export type StoreChange = { table: TableName; id: string; op: "insert" | "update" | "reset" };

export interface Store {
  readonly backend: "memory" | "supabase";
  list<T extends TableName>(table: T, query?: Query<T>): Promise<Row<T>[]>;
  get<T extends TableName>(table: T, id: string): Promise<Row<T> | null>;
  insert<T extends TableName>(table: T, row: Row<T>): Promise<Row<T>>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T>>;
  /** Wipe everything and load the given data (demo reset, seed script). */
  reset(data: SeedData): Promise<void>;
  /** True when the store holds no project yet. */
  isEmpty(): Promise<boolean>;
}

export class NotFoundError extends Error {
  constructor(table: string, id: string) {
    super(`${table} ${id} nicht gefunden`);
    this.name = "NotFoundError";
  }
}
