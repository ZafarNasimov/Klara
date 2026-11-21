import { after, connection } from "next/server";
import { handle, readJson } from "@/lib/api";
import { DEFAULT_PROJECT_ID, getProjectContext, projectNow } from "@/lib/db/repo";
import { defaultTitle } from "@/lib/meetings/model";
import { processMeeting } from "@/lib/meetings/pipeline";
import { createMeeting, getMeeting, patchMeeting } from "@/lib/meetings/repo";
import { SAMPLE_DURATION_SEC, SAMPLE_PARTICIPANTS, SAMPLE_RECORDING } from "@/lib/meetings/sample";

export const maxDuration = 300;

/**
 * "Beispielaufnahme verwenden": a new meeting with the MT-2026-0007 recording
 * (DE, RU, PL, SR, untranslated), run through the real pipeline: translation,
 * extraction, templates. Not a stored result.
 */
export async function POST(req: Request) {
  await connection();
  return handle(async () => {
    const body = await readJson<{ project?: string; meeting_id?: string }>(req).catch(() => ({}) as { project?: string; meeting_id?: string });
    // Started from a recording view: that meeting's site; else the given (or demo) site.
    const projectId = body.meeting_id ? (await getMeeting(body.meeting_id)).project_id : (body.project ?? DEFAULT_PROJECT_ID);
    const now = await projectNow(projectId);
    const ctx = await getProjectContext(projectId);
    const participants = SAMPLE_PARTICIPANTS.map((p) => {
      const c = ctx.contacts.find((x) => x.name === p.name);
      return c ? { ...p, contact_id: c.id, email: c.email || p.email } : p;
    });
    // Started from the recording view: reuse that meeting; else start a new one.
    const id =
      body.meeting_id ??
      (await createMeeting({ projectId, title: defaultTitle(now), type: "bauherr", teamId: null, participants, consent: true, source: "sample" }, now)).id;
    await patchMeeting(id, { status: "processing", source: "sample", participants, ended_at: now.toISOString(), duration_sec: SAMPLE_DURATION_SEC }, { transcript: SAMPLE_RECORDING });
    after(() => processMeeting(id, now, { sample: true }));
    return getMeeting(id);
  });
}
