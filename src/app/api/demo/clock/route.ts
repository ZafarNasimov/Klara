import { clockBase } from "@/lib/clock";
import { BadRequestError, handle, readJson } from "@/lib/api";
import { berlinDay, berlinTime } from "@/lib/deadlines";
import { addEvent, DEFAULT_PROJECT_ID, listProjects, projectNow, updateProjectSettings } from "@/lib/db/repo";

type Body = { project_id?: string; set?: "real" | "07:00" | "16:00"; offset_ms?: number; add_minutes?: number };

/** Demo clock: jump to 07:00 / 16:00 today, shift by minutes, or back to real time. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<Body>(req);
    const projectId = body.project_id ?? DEFAULT_PROJECT_ID;
    const base = clockBase();
    let offset: number;
    if (body.set === "real") offset = 0;
    else if (body.set === "07:00" || body.set === "16:00") {
      const [hh, mm] = body.set.split(":").map(Number);
      offset = berlinTime(berlinDay(base), hh, mm).getTime() - base.getTime();
    } else if (typeof body.offset_ms === "number") offset = body.offset_ms;
    else if (typeof body.add_minutes === "number") offset = (await projectNow(projectId)).getTime() - base.getTime() + body.add_minutes * 60000;
    else throw new BadRequestError("set, offset_ms oder add_minutes angeben");
    // One demo, one clock: without a project_id every site moves.
    const ids = body.project_id ? [body.project_id] : (await listProjects()).map((p) => p.id);
    await Promise.all(ids.map((id) => updateProjectSettings(id, { demo_clock_offset_ms: offset })));
    const now = await projectNow(projectId);
    await addEvent({ project_id: projectId, case_id: null, kind: "demo_clock", payload: { now: now.toISOString() } }, now);
    return { now: now.toISOString(), offset_ms: offset };
  });
}
