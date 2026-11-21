import { connection } from "next/server";
import { BadRequestError, handle, readJson } from "@/lib/api";
import { DEFAULT_PROJECT_ID, projectNow } from "@/lib/db/repo";
import { MEETING_TYPES, type MeetingType, type Participant } from "@/lib/meetings/model";
import { createMeeting, listMeetings } from "@/lib/meetings/repo";

/** Meetings of a project, newest first. */
export async function GET(req: Request) {
  await connection();
  return handle(async () => listMeetings(new URL(req.url).searchParams.get("project") ?? DEFAULT_PROJECT_ID));
}

/** Start a meeting (status "recording"). Recording needs everyone's consent. */
export async function POST(req: Request) {
  await connection();
  return handle(async () => {
    const body = await readJson<{ project?: string; title?: string; type?: string; team_id?: string | null; participants?: Participant[]; consent?: boolean }>(req);
    if (body.consent !== true) throw new BadRequestError("Bitte bestätigen, dass alle Teilnehmer mit der Aufnahme einverstanden sind.");
    const title = String(body.title ?? "").trim();
    if (!title) throw new BadRequestError("Bitte einen Titel eingeben.");
    const type = (MEETING_TYPES as string[]).includes(String(body.type)) ? (body.type as MeetingType) : "bauherr";
    const projectId = body.project ?? DEFAULT_PROJECT_ID;
    const participants = (Array.isArray(body.participants) ? body.participants : [])
      .filter((p) => p && typeof p.name === "string" && p.name.trim())
      .map((p) => ({ name: p.name.trim(), role: String(p.role ?? ""), contact_id: p.contact_id ?? null, email: p.email ?? null }));
    return createMeeting({ projectId, title, type, teamId: body.team_id ?? null, participants, consent: true, source: "recording" }, await projectNow(projectId));
  });
}
