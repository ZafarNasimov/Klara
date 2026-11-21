// The meeting card in the pitch (Scene 4) renders the app's real MeetingDetail
// component. This fixture is MT-2026-0007 in the pitch's story names
// (Wohnanlage Riem / Wohnbau Riem GmbH); the app seeds the same meeting for its
// own demo project (src/lib/meetings/sample.ts).
import type { MeetingView } from "@/lib/meetings/model";

const quote = {
  elektro: "Das 2. OG schaffen wir erst Freitag.",
  steckdosen: "Bitte im 3. OG pro Wohnung zwei zusätzliche Steckdosen.",
  revision: "Plan-Revision C für Trockenbau kommt Montag.",
};

const item = (id: string, kind: MeetingView["items"][number]["kind"], text: string, q: string, speaker: string, ts: number, ref: string | null = null) => ({
  id,
  meeting_id: "pitch",
  kind,
  trade: null,
  team_id: null,
  area: null,
  text,
  owner: null,
  due_date: null,
  quote: q,
  speaker,
  ts_sec: ts,
  new_date: null,
  created_case_id: null,
  updated_case_id: null,
  case_ref: ref,
  status: "offen" as const,
});

export const PITCH_MEETING: MeetingView = {
  id: "pitch-mt-2026-0007",
  project_id: "pitch",
  type: "bauherr",
  audio_url: null,
  created_at: "2026-11-19T08:00:00.000Z",
  case_refs: {},
  transcript: [],
  ref: "MT-2026-0007",
  title: "Baubesprechung KW 47",
  team_id: null,
  participants: [],
  consent: true,
  started_at: "2026-11-19T08:00:00.000Z",
  ended_at: null,
  duration_sec: 482,
  status: "ready",
  steps: { transcription: true, speakers: true, items: true, templates: true },
  summary: [
    "Elektro wird im 2. OG erst Freitag fertig; der Estrich verschiebt sich.",
    "Bauherr ordnet im 3. OG zwei zusätzliche Steckdosen pro Wohnung an.",
  ],
  items: [
    { ...item("p1", "behinderung", "Estrich 2. OG wartet auf Elektro bis Freitag.", quote.elektro, "Elektro", 38, "KL-2026-0042"), case_action: "updated", updated_case_id: "z" },
    { ...item("p2", "anordnung", "Zwei zusätzliche Steckdosen pro Wohnung im 3. OG.", quote.steckdosen, "Wohnbau Riem GmbH", 152, "KL-2026-0043"), case_action: "created", created_case_id: "x" },
    { ...item("p3", "mehrkosten", "Zusatzleistung vor Beginn anzeigen.", quote.steckdosen, "Wohnbau Riem GmbH", 152, "KL-2026-0044"), case_action: "created", created_case_id: "y" },
    item("p4", "task", "Plan-Revision C liefern", quote.revision, "Lehner Architekten", 246),
  ],
  changes: [
    { kind: "case_updated", text_de: "KL-2026-0042 aktualisiert: voraussichtliches Ende Freitag", case_id: null, case_ref: "KL-2026-0042" },
    { kind: "case_created", text_de: "Neuer Entwurf KL-2026-0043: Bestätigung mündlicher Anordnung", case_id: null, case_ref: "KL-2026-0043" },
    { kind: "case_created", text_de: "Neuer Entwurf KL-2026-0044: Mehrkostenanzeige", case_id: null, case_ref: "KL-2026-0044" },
    { kind: "schedule_updated", text_de: "Termin Elektro 2. OG: +2 Arbeitstage", case_id: null, case_ref: null },
    { kind: "tasks_created", text_de: "4 Aufgaben angelegt", case_id: null, case_ref: null },
  ],
  notice: null,
  error: null,
  source: "seed",
  mail: null,
};
