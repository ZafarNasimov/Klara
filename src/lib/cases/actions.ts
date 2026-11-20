// Office actions on a case (SPEC §8 /admin/case/[id]): validate the letter,
// or send it back to the Polier with a question in their language.
import "server-only";
import { BadRequestError } from "@/lib/api";
import { store } from "@/lib/db";
import { addEvent, addTurn, createConversation, listConversations, requireCase, updateCase, updateConversation } from "@/lib/db/repo";
import { NotFoundError } from "@/lib/db/store";
import { fieldLabel, requireDocType } from "@/lib/doctypes";
import { generateDocument } from "@/lib/documents/generate";
import { DOC_SPOKEN, fill, LINES } from "@/lib/agent/lines";
import { line, question, translateNote } from "@/lib/agent/phrase";
import type { AppUser, Case, DocumentVersion } from "@/lib/types";

const SENT = new Set(["versendet", "beantwortet", "abgeschlossen"]);

async function requireUser(id: string | null | undefined): Promise<AppUser> {
  if (!id) throw new BadRequestError("Benutzer fehlt");
  const u = await store().get("app_user", id);
  if (!u) throw new NotFoundError("app_user", id);
  return u;
}

/** Why a case cannot be validated yet, or null when it can. */
export function validationBlocker(c: Case): string | null {
  if (c.status === "entwurf") return "Der Polier hat die Meldung noch nicht bestätigt.";
  if (SENT.has(c.status)) return "Das Schreiben ist bereits versendet.";
  if (c.flags.includes("returned")) return "Liegt zur Ergänzung beim Polier.";
  if (c.missing_fields.length) return `Es fehlen noch Angaben: ${c.missing_fields.map((k) => fieldLabel(c.doc_type, k)).join(", ")}.`;
  const red = c.checks.find((x) => x.light === "red");
  if (red) return `${red.label_de}: ${red.reason_de}`;
  return null;
}

/** The Bauleiter approves the current letter version (needed before sending). */
export async function validateCase(caseId: string, userId: string | null | undefined, at: Date): Promise<{ case: Case; version: DocumentVersion }> {
  const user = await requireUser(userId);
  if (user.role !== "bauleiter") throw new BadRequestError("Nur die Bauleitung kann Schreiben validieren.");
  const c = await requireCase(caseId);
  if (c.status === "validiert") throw new BadRequestError("Das Schreiben ist bereits validiert.");
  const blocker = validationBlocker(c);
  if (blocker) throw new BadRequestError(blocker);
  // The letter must match the current facts; this returns the latest version or writes a new one.
  const v = await generateDocument(caseId, at);
  if (!v) throw new BadRequestError("Für diesen Dokumenttyp gibt es noch keine Vorlage.");
  const version = await store().update("document_version", v.id, { validated_by: user.id, validated_at: at.toISOString() });
  const saved = await updateCase(caseId, { status: "validiert" }, at);
  await addEvent(
    { project_id: c.project_id, case_id: c.id, kind: "case_validated", payload: { reference: c.reference, version: v.version, by: user.name } },
    at,
  );
  return { case: saved, version };
}

/** Fields the office can ask the Polier about: missing ones first. */
export function askableFields(c: Case): { key: string; label: string; missing: boolean }[] {
  const def = requireDocType(c.doc_type);
  return def.fields
    .filter((f) => (f.source ?? "user") === "user" && (f.ask || f.question_hint))
    .map((f) => ({ key: f.key, label: f.label_de, missing: c.missing_fields.includes(f.key) }))
    .sort((a, b) => Number(b.missing) - Number(a.missing));
}

/**
 * "Zurück zur Ergänzung": Klara asks the Polier in the team chat, in their
 * language. The case goes back into the chat's open cases, so the answer
 * updates it and the Polier confirms again (new letter version).
 */
export async function returnForCompletion(
  caseId: string,
  input: { field?: string | null; note_de?: string | null; user_id?: string | null },
  at: Date,
): Promise<Case> {
  const c = await requireCase(caseId);
  if (SENT.has(c.status)) throw new BadRequestError("Das Schreiben ist bereits versendet.");
  if (!c.team_id) throw new BadRequestError("Der Vorgang gehört zu keinem Team.");
  const field = input.field ? askableFields(c).find((f) => f.key === input.field) : null;
  if (input.field && !field) throw new BadRequestError("Diese Angabe kann Klara nicht erfragen.");
  const note_de = input.note_de?.trim() || null;
  if (!field && !note_de) throw new BadRequestError("Bitte eine Angabe auswählen oder eine Nachricht schreiben.");
  const by = input.user_id ? await requireUser(input.user_id) : null;

  const team = await store().get("team", c.team_id);
  if (!team) throw new NotFoundError("team", c.team_id);
  const lead = team.lead_user_id ? await store().get("app_user", team.lead_user_id) : null;
  const convs = await listConversations(team.id);
  const conv =
    convs.find((x) => x.kind === "chat" && x.status === "open") ??
    (await createConversation({ team_id: team.id, user_id: team.lead_user_id ?? by?.id ?? "", kind: "chat", language: lead?.language ?? null }, at));
  const lang = conv.language ?? lead?.language ?? "de";

  const say = async (l: string) => {
    const doc = DOC_SPOKEN[l]?.[c.doc_type] ?? requireDocType(c.doc_type).title_de;
    const intro = LINES[l] ? fill(LINES[l].returnedFor, { doc, ref: c.reference }) : await line("returnedFor", l, { doc, ref: c.reference });
    const parts = [intro];
    if (note_de) parts.push(l === "de" ? `„${note_de}“` : `“${await translateNote(note_de, l)}”`);
    if (field) parts.push(await question(c.doc_type, field.key, l));
    return parts.join(" ");
  };
  const [text, text_de] = await Promise.all([say(lang), lang === "de" ? Promise.resolve(null) : say("de")]);
  await addTurn({ conversation_id: conv.id, role: "klara", text_original: text, text_de: text_de ?? text, language: lang, audio_url: null }, at);

  const state = conv.state;
  await updateConversation(conv.id, {
    state: {
      ...state,
      pending_case_ids: [...new Set([...state.pending_case_ids, c.id])],
      asked: field ? { case_id: c.id, field: field.key } : null,
      awaiting_confirm: null,
    },
  });
  const saved = await updateCase(c.id, { status: "unvollstaendig", flags: [...new Set([...c.flags, "returned"])] }, at);
  await addEvent(
    {
      project_id: c.project_id,
      case_id: c.id,
      kind: "returned_for_completion",
      payload: { reference: c.reference, field: field?.key ?? null, note: [field?.label, note_de].filter(Boolean).join(": "), by: by?.name ?? null },
    },
    at,
  );
  return saved;
}
