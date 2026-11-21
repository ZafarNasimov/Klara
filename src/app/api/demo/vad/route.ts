import { BadRequestError, handle, readJson } from "@/lib/api";
import { DEFAULT_PROJECT_ID, listProjects, updateProjectSettings } from "@/lib/db/repo";

type Body = { project_id?: string; silence_ms?: number; min_speech_ms?: number; positive_threshold?: number };

const inRange = (v: unknown, min: number, max: number, name: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new BadRequestError(`${name} muss zwischen ${min} und ${max} liegen`);
  return v;
};

/** Hands-free tuning (SPEC M3): pause before end of turn, minimum speech, speech threshold. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<Body>(req);
    const vad = {
      silence_ms: Math.round(inRange(body.silence_ms, 300, 3000, "Pause bis Sprechende")),
      min_speech_ms: Math.round(inRange(body.min_speech_ms, 100, 2000, "Mindestlänge")),
      positive_threshold: inRange(body.positive_threshold, 0.2, 0.95, "Sprachschwelle"),
    };
    // The same microphone settings on every site unless one is named.
    const ids = body.project_id ? [body.project_id] : (await listProjects()).map((x) => x.id);
    const saved = await Promise.all(ids.map((id) => updateProjectSettings(id, { vad })));
    return { vad: (saved.find((p) => p.id === (body.project_id ?? DEFAULT_PROJECT_ID)) ?? saved[0]).settings.vad };
  });
}
