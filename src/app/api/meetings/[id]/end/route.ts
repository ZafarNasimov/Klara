import { after, connection } from "next/server";
import { BadRequestError, handle, readJson } from "@/lib/api";
import { projectNow } from "@/lib/db/repo";
import { processMeeting } from "@/lib/meetings/pipeline";
import { getMeeting, patchMeeting } from "@/lib/meetings/repo";

// Transcription and extraction of a long meeting can take a while.
export const maxDuration = 300;

/** "Meeting beenden": close the recording and start the processing (in the background). */
export async function POST(req: Request, ctx: RouteContext<"/api/meetings/[id]/end">) {
  await connection();
  return handle(async () => {
    const { id } = await ctx.params;
    const m = await getMeeting(id);
    if (m.status !== "recording" && m.status !== "failed") throw new BadRequestError("Die Besprechung ist bereits beendet.");
    if (!m.transcript.length && !(m.chunks ?? 0)) throw new BadRequestError("Es wurde noch keine Aufnahme hochgeladen.");
    const body = await readJson<{ duration_sec?: number }>(req).catch(() => ({ duration_sec: undefined }));
    const now = await projectNow(m.project_id);
    const duration = Number.isFinite(body.duration_sec) ? Math.max(0, Math.round(Number(body.duration_sec))) : m.duration_sec;
    await patchMeeting(id, { status: "processing", ended_at: now.toISOString(), duration_sec: duration });
    after(() => processMeeting(id, now));
    return getMeeting(id);
  });
}
