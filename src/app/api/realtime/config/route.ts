import { connection } from "next/server";
import { dataBackend } from "@/lib/db";

/** Which live channel the browser should use: Supabase Realtime only when the server writes to Supabase. */
export async function GET() {
  await connection();
  return Response.json({ channel: dataBackend() === "supabase" ? "supabase" : "sse" });
}
