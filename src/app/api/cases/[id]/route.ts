import { connection } from "next/server";
import { handle } from "@/lib/api";
import { caseDetail } from "@/lib/cases/detail";

/** One case with versions, evidence, timeline and linked cases. */
export async function GET(_req: Request, ctx: RouteContext<"/api/cases/[id]">) {
  await connection();
  return handle(async () => caseDetail((await ctx.params).id));
}
