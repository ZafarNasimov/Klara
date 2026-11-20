import { connection } from "next/server";
import { handle } from "@/lib/api";
import { store } from "@/lib/db";
import { getDailyReport, getProjectContext, listCases, listConversations, listTurns, toCaseViews } from "@/lib/db/repo";
import { NotFoundError } from "@/lib/db/store";
import { clockBase, withOffset } from "@/lib/clock";
import { berlinDay, TZ } from "@/lib/deadlines";
import { llmMode } from "@/lib/runtime";
import { readbackView } from "@/lib/agent/phrase";
import type { ChannelFeed } from "@/lib/types";

const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" });

/** Everything the team channel shows: chat with Klara, case cards, today's cards. */
export async function GET(_req: Request, ctx: RouteContext<"/api/channel/[teamId]">) {
  await connection();
  return handle(async (): Promise<ChannelFeed> => {
    const { teamId } = await ctx.params;
    const team = await store().get("team", teamId);
    if (!team) throw new NotFoundError("team", teamId);
    const pctx = await getProjectContext(team.project_id);
    const now = withOffset(clockBase(), pctx.project.settings.demo_clock_offset_ms);
    const day = berlinDay(now);

    const conversations = await listConversations(teamId);
    const chat = conversations.find((c) => c.kind === "chat" && c.status === "open") ?? null;
    const calls = conversations.filter((c) => c.kind === "call");
    const [turns, callTurns, cases, report, progress] = await Promise.all([
      chat ? listTurns(chat.id) : Promise.resolve([]),
      Promise.all(calls.map((c) => listTurns(c.id))),
      listCases(team.project_id),
      getDailyReport(teamId, day),
      store().list("progress_entry", { where: { date: day } }),
    ]);

    const trade = pctx.trades.find((t) => t.team_id === teamId) ?? null;
    const items = pctx.schedule
      .filter((s) => trade && s.trade_id === trade.id && s.start_date <= day && day <= s.end_date)
      .map((s) => ({
        id: s.id,
        label: `${trade!.name} ${s.area}`,
        unit: s.unit,
        planned_per_day: s.planned_per_day,
        actual_today: progress.find((p) => p.schedule_item_id === s.id)?.actual_qty ?? null,
      }));
    const lead = team.lead_user_id ? await store().get("app_user", team.lead_user_id) : null;
    const language = chat?.language ?? lead?.language ?? "de";
    const awaiting = chat?.state.awaiting_confirm ?? [];
    const confirm = awaiting.length
      ? readbackView(
          awaiting.map((id) => cases.find((c) => c.id === id)).filter((c) => !!c),
          language,
          now,
        )
      : null;
    const entries = Array.isArray(report?.data.entries) ? (report.data.entries as { kind?: string }[]) : [];

    return {
      team,
      project_name: pctx.project.name,
      now: now.toISOString(),
      llm_mode: llmMode(),
      conversation: chat,
      language,
      turns,
      confirm,
      cases: await toCaseViews(
        cases.filter((c) => c.team_id === teamId && c.status !== "entwurf"),
        pctx,
      ),
      calls: calls
        .map((c, i) => ({ id: c.id, started_at: c.started_at, ended_at: c.ended_at, turns: callTurns[i].length }))
        .filter((c) => c.turns > 0),
      today: { day, hour: Number(hourFmt.format(now)), diary_done: entries.some((e) => e.kind === "note"), items },
    };
  });
}
