import { connection } from "next/server";
import { handle } from "@/lib/api";
import { listCases } from "@/lib/db/repo";

export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("project") ?? undefined;
  const teamId = url.searchParams.get("team");
  return handle(async () => {
    const cases = await listCases(projectId);
    return teamId ? cases.filter((c) => c.team_id === teamId) : cases;
  });
}
