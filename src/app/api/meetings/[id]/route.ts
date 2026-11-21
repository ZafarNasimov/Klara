import { connection } from "next/server";
import { handle } from "@/lib/api";
import { getMeeting } from "@/lib/meetings/repo";

/** One meeting (the UI polls this while it is processed). */
export async function GET(_req: Request, ctx: RouteContext<"/api/meetings/[id]">) {
  await connection();
  return handle(async () => getMeeting((await ctx.params).id));
}
