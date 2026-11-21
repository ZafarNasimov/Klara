// Meeting notes (Besprechungen): shared types and labels. Client-safe.
//
// Storage: one row in the existing `meeting` table. `type` holds the meeting
// type, `transcript` the segments, `protocol` everything else (header, items,
// changes, processing steps). No schema change, so the live Supabase project
// keeps working without a migration.

export type MeetingType = "bauherr" | "intern" | "nu_koordination";
export const MEETING_TYPES: MeetingType[] = ["bauherr", "intern", "nu_koordination"];
export const MEETING_TYPE_DE: Record<MeetingType, string> = {
  bauherr: "Bauherrenbesprechung",
  intern: "Interne Besprechung",
  nu_koordination: "NU-Koordination",
};

export type MeetingStatus = "recording" | "processing" | "ready" | "failed";

export type Segment = { speaker: string; start_sec: number; text: string };

export type ItemKind = "decision" | "task" | "anordnung" | "mehrkosten" | "behinderung" | "mangel" | "bedenken" | "termin";
export const ITEM_KINDS: ItemKind[] = ["decision", "task", "anordnung", "mehrkosten", "behinderung", "mangel", "bedenken", "termin"];

/** Kinds that fill a letter or the schedule ("Erkannt & erstellt"), in display order. */
export const TEMPLATE_KINDS = ["anordnung", "mehrkosten", "behinderung", "mangel", "bedenken", "termin"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_DE: Record<TemplateKind, { title: string; nothing: string; docType: string | null }> = {
  anordnung: { title: "Bestätigung mündlicher Anordnung", nothing: "Anordnungen: nichts erkannt", docType: "anordnung_bestaetigung" },
  mehrkosten: { title: "Mehrkostenanzeige", nothing: "Mehrkosten: nichts erkannt", docType: "mehrkostenanzeige" },
  behinderung: { title: "Behinderungsanzeige", nothing: "Behinderungen: nichts erkannt", docType: "behinderungsanzeige" },
  mangel: { title: "Mängelanzeige", nothing: "Mängel: nichts erkannt", docType: "maengelanzeige" },
  bedenken: { title: "Bedenkenanzeige", nothing: "Bedenken: nichts erkannt", docType: "bedenken" },
  termin: { title: "Terminänderung", nothing: "Termine: nichts erkannt", docType: null },
};

export type MeetingItem = {
  id: string;
  meeting_id: string;
  kind: ItemKind;
  trade: string | null;
  team_id: string | null;
  area: string | null;
  text: string;
  owner: string | null;
  /** YYYY-MM-DD */
  due_date: string | null;
  /** Verbatim from the transcript. Items without one are discarded. */
  quote: string;
  speaker: string;
  ts_sec: number;
  /** Termin / Behinderung: new end, e.g. "Freitag" resolved to a date. */
  new_date: string | null;
  created_case_id: string | null;
  updated_case_id: string | null;
  /** KL-… of the case this item created or updated (stays readable if the case is gone). */
  case_ref: string | null;
  /** What happened to the case: drafted, updated, or it already existed (re-run). */
  case_action?: "created" | "updated" | "existing" | "noop";
  /** The doc type of that case: a reference only links if the case is of this type. */
  case_doc_type?: string;
  status: "offen" | "erledigt";
};

export type MeetingChange = {
  kind: "case_created" | "case_updated" | "schedule_updated" | "tasks_created";
  text_de: string;
  case_id: string | null;
  case_ref: string | null;
  case_doc_type?: string;
};

export type Participant = { name: string; role: string; contact_id: string | null; email: string | null };

export const PROCESSING_STEPS = ["transcription", "speakers", "items", "templates"] as const;
export type ProcessingStep = (typeof PROCESSING_STEPS)[number];
export const PROCESSING_STEP_DE: Record<ProcessingStep, string> = {
  transcription: "Transkription",
  speakers: "Sprecher erkennen",
  items: "Entscheidungen & Aufgaben",
  templates: "Vorlagen prüfen",
};

export type MailDraft = { to: string[]; subject: string; body: string; status: "entwurf" | "versendet"; sent_at: string | null; simulated: boolean };

/** What the `protocol` column holds. */
export type MeetingProtocol = {
  ref: string; // MT-2026-0007
  title: string;
  team_id: string | null;
  participants: Participant[];
  consent: boolean;
  started_at: string;
  ended_at: string | null;
  duration_sec: number;
  status: MeetingStatus;
  steps: Record<ProcessingStep, boolean>;
  summary: string[];
  items: MeetingItem[];
  changes: MeetingChange[];
  /** e.g. sample run fell back to the stored result because the LLM was unreachable. */
  notice: string | null;
  error: string | null;
  source: "recording" | "upload" | "sample" | "seed";
  mail: MailDraft | null;
  /** Audio chunks uploaded so far (recording) and their type. */
  chunks?: number;
  audio_mime?: string;
};

/** One meeting as the UI sees it. */
export type MeetingView = MeetingProtocol & {
  id: string;
  project_id: string;
  type: MeetingType;
  audio_url: string | null;
  transcript: Segment[];
  created_at: string;
  /** case id → reference, for links of items/changes that point at cases. */
  case_refs: Record<string, string>;
};

/** "1 Anordnung · 4 Aufgaben · Elektro +2 Tage" for the list. */
export function outcomeChips(m: Pick<MeetingProtocol, "items" | "changes">): string[] {
  const count = (k: ItemKind) => m.items.filter((i) => i.kind === k).length;
  const chips: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (count("anordnung")) chips.push(plural(count("anordnung"), "Anordnung", "Anordnungen"));
  if (count("mehrkosten")) chips.push(plural(count("mehrkosten"), "Mehrkostenanzeige", "Mehrkostenanzeigen"));
  if (count("behinderung")) chips.push(plural(count("behinderung"), "Behinderung", "Behinderungen"));
  if (count("mangel")) chips.push(plural(count("mangel"), "Mangel", "Mängel"));
  if (count("bedenken")) chips.push(plural(count("bedenken"), "Bedenken", "Bedenken"));
  if (count("decision")) chips.push(plural(count("decision"), "Entscheidung", "Entscheidungen"));
  if (count("task")) chips.push(plural(count("task"), "Aufgabe", "Aufgaben"));
  for (const c of m.changes) if (c.kind === "schedule_updated") chips.push(c.text_de.replace(/^Termin\s+/, "").replace(/:.*?([+-]\d+ (Arbeits)?Tag(e)?)$/, " $1"));
  return chips;
}

export function emptySteps(done = false): Record<ProcessingStep, boolean> {
  return { transcription: done, speakers: done, items: done, templates: done };
}

/** "Baubesprechung KW 47" for a date. */
export function defaultTitle(date: Date): string {
  return `Baubesprechung KW ${isoWeek(date)}`;
}

export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
