import { connection } from "next/server";
import { handle } from "@/lib/api";
import { DEFAULT_PROJECT_ID, listEvents } from "@/lib/db/repo";

/** Timeline events of a project (or one case), newest first. */
export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const limit = Math.min(Number(p.get("limit") ?? 50) || 50, 200);
    return listEvents({ projectId: p.get("project") ?? DEFAULT_PROJECT_ID, caseId: p.get("case") ?? undefined, limit });
  });
}
