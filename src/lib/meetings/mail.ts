// "Protokoll an Teilnehmer senden": a draft built from the meeting; it leaves
// the app only when a person confirms it (never automatically).
import "server-only";
import { BadRequestError } from "@/lib/api";
import { addEvent, projectNow } from "@/lib/db/repo";
import { berlinDay, fmtDayDe } from "@/lib/deadlines";
import { deliver } from "@/lib/mail/delivery";
import { fmtClock, MEETING_TYPE_DE, TEMPLATE_KINDS, type MailDraft, type MeetingView } from "./model";
import { getMeeting, patchMeeting } from "./repo";

export function protocolText(m: MeetingView): string {
  const date = fmtDayDe(berlinDay(new Date(m.started_at)));
  const lines: string[] = [
    `Protokoll ${m.title} (${m.ref})`,
    `${MEETING_TYPE_DE[m.type]}, ${date}, Dauer ${fmtClock(m.duration_sec)}`,
    `Teilnehmer: ${m.participants.map((p) => `${p.name} (${p.role})`).join(", ") || "–"}`,
    "",
    "Zusammenfassung",
    ...m.summary.map((s) => `- ${s}`),
  ];
  const decisions = m.items.filter((i) => i.kind === "decision");
  if (decisions.length) lines.push("", "Entscheidungen", ...decisions.map((i) => `- ${i.text}`));
  const tasks = m.items.filter((i) => i.kind === "task");
  if (tasks.length) {
    lines.push("", "Aufgaben", ...tasks.map((i) => `- ${i.text}${i.owner ? ` – ${i.owner}` : ""}${i.due_date ? ` – bis ${fmtDayDe(i.due_date)}` : ""}`));
  }
  const letters = m.items.filter((i) => (TEMPLATE_KINDS as readonly string[]).includes(i.kind));
  if (letters.length) lines.push("", "Festgehalten", ...letters.map((i) => `- ${i.text} („${i.quote_de}“${i.quote_language !== "de" ? ` – ${i.quote_language.toUpperCase()}: „${i.quote_original}“` : ""}, ${i.speaker}, ${fmtClock(i.ts_sec)})`));
  lines.push("", "Bitte melden Sie Korrekturen innerhalb von 3 Werktagen.", "", "Mit freundlichen Grüßen", "Muster Bau GmbH");
  return lines.join("\n");
}

/** The draft (created on first open). */
export async function protocolDraft(id: string): Promise<MailDraft> {
  const m = await getMeeting(id);
  if (m.status !== "ready") throw new BadRequestError("Das Protokoll ist noch nicht fertig.");
  if (m.mail) return m.mail;
  const draft: MailDraft = {
    to: m.participants.map((p) => p.email).filter((e): e is string => !!e),
    subject: `Protokoll ${m.title} (${m.ref})`,
    body: protocolText(m),
    status: "entwurf",
    sent_at: null,
    simulated: false,
  };
  await patchMeeting(id, { mail: draft });
  return draft;
}

/** Send after the person confirmed the (possibly edited) draft. */
export async function sendProtocol(id: string, edited: { to: string[]; subject: string; body: string }): Promise<MailDraft> {
  const m = await getMeeting(id);
  if (m.mail?.status === "versendet") throw new BadRequestError("Das Protokoll wurde bereits versendet.");
  const to = edited.to.map((x) => x.trim()).filter(Boolean);
  if (!to.length) throw new BadRequestError("Bitte mindestens einen Empfänger angeben.");
  if (to.some((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) throw new BadRequestError("Eine Empfängeradresse ist ungültig.");
  if (!edited.subject.trim() || !edited.body.trim()) throw new BadRequestError("Betreff und Text dürfen nicht leer sein.");
  const now = await projectNow(m.project_id);
  const sent = await deliver({ to, cc: [], subject: edited.subject.trim(), text: edited.body, attachments: [], metadata: { meeting: m.ref } }, now);
  const mail: MailDraft = { to, subject: edited.subject.trim(), body: edited.body, status: "versendet", sent_at: sent.submittedAt, simulated: sent.delivery === "simulated" };
  await patchMeeting(id, { mail });
  await addEvent(
    {
      project_id: m.project_id,
      case_id: null,
      kind: "meeting_protocol_sent",
      payload: { source: `meeting:${m.ref}`, meeting_id: m.id, summary_de: `${m.title} → Protokoll ${mail.simulated ? "als Testversand " : ""}an ${to.length} Teilnehmer` },
    },
    now,
  );
  return mail;
}
