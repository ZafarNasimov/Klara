import { connection } from "next/server";
import { handle } from "@/lib/api";
import { DEFAULT_PROJECT_ID, listCases, toCaseViews } from "@/lib/db/repo";

/** All cases of a project, newest first, with read-time deadlines. */
export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const projectId = new URL(req.url).searchParams.get("project") ?? DEFAULT_PROJECT_ID;
    return toCaseViews(await listCases(projectId));
  });
}
