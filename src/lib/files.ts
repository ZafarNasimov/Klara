// Files (photos): Supabase Storage when the data lives in Supabase (bucket
// SUPABASE_STORAGE_BUCKET, default "klara", private), else local: kept in
// memory and, unless MEMORY_PERSIST=0, under .data/files/.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { dataBackend } from "@/lib/db";
import { db } from "@/lib/db/supabase-store";

const bucket = () => process.env.SUPABASE_STORAGE_BUCKET?.trim() || "klara";

const g = globalThis as unknown as { __klaraFiles?: Map<string, { bytes: Buffer; contentType: string }> };
const memory = () => (g.__klaraFiles ??= new Map());

function localPath(key: string): string | null {
  if (process.env.MEMORY_PERSIST === "0") return null;
  const root = process.env.VERCEL ? "/tmp/klara-files" : path.join(process.cwd(), ".data", "files");
  return path.join(root, ...key.split("/"));
}

export async function saveFile(key: string, bytes: Buffer, contentType: string): Promise<void> {
  if (dataBackend() === "supabase") {
    const { error } = await db().storage.from(bucket()).upload(key, bytes, { contentType, upsert: false });
    if (error) throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
    return;
  }
  memory().set(key, { bytes, contentType });
  const file = localPath(key);
  if (file) {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, bytes);
  }
}

export async function readFile(key: string): Promise<Buffer | null> {
  if (dataBackend() === "supabase") {
    const { data, error } = await db().storage.from(bucket()).download(key);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  const hit = memory().get(key);
  if (hit) return hit.bytes;
  const file = localPath(key);
  return file && fs.existsSync(file) ? fs.promises.readFile(file) : null;
}
