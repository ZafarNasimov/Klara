import { connection } from "next/server";
import { BadRequestError, handle, readJson } from "@/lib/api";
import { protocolDraft, sendProtocol } from "@/lib/meetings/mail";

/** The protocol e-mail draft (created on first open, never sent by itself). */
export async function GET(_req: Request, ctx: RouteContext<"/api/meetings/[id]/mail">) {
  await connection();
  return handle(async () => protocolDraft((await ctx.params).id));
}

/** Send the confirmed draft. Needs { confirm: true }. */
export async function POST(req: Request, ctx: RouteContext<"/api/meetings/[id]/mail">) {
  await connection();
  return handle(async () => {
    const body = await readJson<{ confirm?: boolean; to?: string[]; subject?: string; body?: string }>(req);
    if (body.confirm !== true) throw new BadRequestError("Versand nur nach Bestätigung.");
    return sendProtocol((await ctx.params).id, { to: Array.isArray(body.to) ? body.to : [], subject: String(body.subject ?? ""), body: String(body.body ?? "") });
  });
}
