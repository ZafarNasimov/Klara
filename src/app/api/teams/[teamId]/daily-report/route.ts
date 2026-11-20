import { handle, readJson } from "@/lib/api";
import { store } from "@/lib/db";
import { projectNow } from "@/lib/db/repo";
import { NotFoundError } from "@/lib/db/store";
import { berlinDay } from "@/lib/deadlines";
import { compileDailyReport } from "@/lib/reports/daily";

/** Build or refresh the team's Bautagesbericht (default: today on the demo clock). */
export async function POST(req: Request, ctx: RouteContext<"/api/teams/[teamId]/daily-report">) {
  return handle(async () => {
    const { teamId } = await ctx.params;
    const body = await readJson<{ date?: string | null }>(req);
    const team = await store().get("team", teamId);
    if (!team) throw new NotFoundError("team", teamId);
    const now = await projectNow(team.project_id);
    const day = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : berlinDay(now);
    return { case: await compileDailyReport(teamId, day, now) };
  });
}
