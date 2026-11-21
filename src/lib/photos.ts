// Photos from the site (SPEC §8 "Foto" in the team channel and on the call
// screen). A photo is evidence of a case (evidence.case_id is required):
// the case being talked about in that conversation, else the team's newest
// case of the day, else that day's Bautagesbericht. Klara confirms in the
// chat in the Polier's language.
import "server-only";
import { BadRequestError } from "@/lib/api";
import { fill, LINES } from "@/lib/agent/lines";
import { line } from "@/lib/agent/phrase";
import { store } from "@/lib/db";
import { addEvent, addEvidence, addTurn, requireCase, uid } from "@/lib/db/repo";
import { NotFoundError } from "@/lib/db/store";
import { berlinDay } from "@/lib/deadlines";
import { saveFile } from "@/lib/files";
import { compileDailyReport, findDailyReportCase } from "@/lib/reports/daily";
import type { Case, Evidence, Turn } from "@/lib/types";

export const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };
/** Below Vercel's 4.5 MB request limit; the app shrinks photos to ~1600 px before upload. */
export const PHOTO_MAX_BYTES = 4_000_000;

export type PhotoInput = {
  teamId: string;
  conversationId?: string | null;
  caseId?: string | null;
  bytes: Buffer;
  contentType: string;
  width?: number | null;
  height?: number | null;
};

export type PhotoResult = { evidence: Evidence; case: Case; klara_turn: Turn | null };

/** The case a new photo belongs to (see the file comment). */
export async function photoTarget(teamId: string, conversationId: string | null, caseId: string | null, at: Date): Promise<Case> {
  if (caseId) return requireCase(caseId);
  if (conversationId) {
    const conv = await store().get("conversation", conversationId);
    const ids = conv?.state?.pending_case_ids ?? [];
    for (const id of [...ids].reverse()) {
      const c = await store().get("case", id);
      if (c) return c;
    }
  }
  const today = berlinDay(at);
  const ofToday = (await store().list("case", { where: { team_id: teamId } }))
    .filter((c) => c.doc_type !== "bautagesbericht" && berlinDay(new Date(c.created_at)) === today)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return ofToday[0] ?? compileDailyReport(teamId, today, at);
}

export async function attachPhoto(input: PhotoInput, at: Date): Promise<PhotoResult> {
  const ext = PHOTO_TYPES[input.contentType];
  if (!ext) throw new BadRequestError("Nur Fotos (JPEG, PNG, WebP, HEIC) können abgelegt werden.");
  if (input.bytes.length > PHOTO_MAX_BYTES) throw new BadRequestError("Das Foto ist zu groß (höchstens 4 MB).");
  const team = await store().get("team", input.teamId);
  if (!team) throw new NotFoundError("team", input.teamId);
  const lead = team.lead_user_id ? await store().get("app_user", team.lead_user_id) : null;
  const conv = input.conversationId ? await store().get("conversation", input.conversationId) : null;

  const c = await photoTarget(team.id, conv?.id ?? null, input.caseId ?? null, at);
  const key = `photos/${c.id}/${uid()}.${ext}`;
  await saveFile(key, input.bytes, input.contentType);
  const by = lead?.name ?? team.name;
  const evidence = await addEvidence(
    {
      case_id: c.id,
      kind: "photo",
      ref: key,
      data: {
        content_type: input.contentType,
        bytes: input.bytes.length,
        width: input.width ?? null,
        height: input.height ?? null,
        team_id: team.id,
        conversation_id: conv?.id ?? null,
        by,
        summary_de: `Foto von ${by}`,
      },
    },
    at,
  );

  let klaraTurn: Turn | null = null;
  if (conv) {
    const lang = conv.language ?? lead?.language ?? "de";
    klaraTurn = await addTurn(
      {
        conversation_id: conv.id,
        role: "klara",
        text_original: await line("photoSaved", lang, { ref: c.reference }),
        text_de: fill(LINES.de.photoSaved, { ref: c.reference }),
        language: lang,
        audio_url: null,
      },
      at,
    );
  }
  // Today's Bautagesbericht counts the day's photos: bring it up to date if it exists.
  const today = berlinDay(at);
  const report = await findDailyReportCase(team.id, today);
  if (report) {
    try {
      await compileDailyReport(team.id, today, at);
    } catch (err) {
      console.error("[klara] daily report after photo failed", team.name, today, err);
    }
  }

  // Last: the event makes open office screens refetch.
  await addEvent(
    { project_id: c.project_id, case_id: c.id, kind: "photo_added", payload: { reference: c.reference, evidence_id: evidence.id, summary_de: `Foto von ${by}` } },
    at,
  );
  return { evidence, case: c, klara_turn: klaraTurn };
}
