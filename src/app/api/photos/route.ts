import { BadRequestError, handle } from "@/lib/api";
import { projectNow, DEFAULT_PROJECT_ID } from "@/lib/db/repo";
import { attachPhoto } from "@/lib/photos";

const field = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/**
 * "Foto" (SPEC §8): multipart `photo` + `team_id` (+ `conversation_id`, `case_id`,
 * `width`, `height`). Stores the photo as evidence of the right case and,
 * in a conversation, Klara's confirmation in the Polier's language.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData().catch(() => {
      throw new BadRequestError("Erwartet multipart/form-data mit photo");
    });
    const photo = form.get("photo");
    if (!(photo instanceof Blob) || photo.size === 0) throw new BadRequestError("Foto fehlt");
    const teamId = field(form, "team_id");
    if (!teamId) throw new BadRequestError("team_id fehlt");
    const num = (name: string) => {
      const n = Number(field(form, name));
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    };
    const r = await attachPhoto(
      {
        teamId,
        conversationId: field(form, "conversation_id"),
        caseId: field(form, "case_id"),
        bytes: Buffer.from(await photo.arrayBuffer()),
        contentType: photo.type || "image/jpeg",
        width: num("width"),
        height: num("height"),
      },
      await projectNow(DEFAULT_PROJECT_ID),
    );
    return {
      evidence: r.evidence,
      url: `/api/photos/${r.evidence.id}`,
      case: { id: r.case.id, reference: r.case.reference, doc_type: r.case.doc_type },
      klara_turn: r.klara_turn,
    };
  });
}
