import { connection } from "next/server";
import { handle } from "@/lib/api";
import { parseFilters } from "@/lib/dashboard/compute";
import { loadDashboard } from "@/lib/dashboard/load";

/** Portfolio / project dashboard, computed from the store. ?site= &team= &trade= &days=7|14|30 */
export async function GET(req: Request) {
  await connection();
  return handle(async () => loadDashboard(parseFilters(new URL(req.url).searchParams)));
}
