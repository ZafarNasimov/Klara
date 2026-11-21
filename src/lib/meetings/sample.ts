// Sample meetings: the seed (MT-2026-0007, MT-2026-0006) and the recording
// behind "Beispielaufnahme verwenden". The sample transcript runs through the
// real pipeline; SAMPLE_RESULT is only the offline fallback (LLM unreachable).
// Names follow the demo project "Neubau Bürogebäude München" (seed.ts).
import { berlinDay, berlinTime, subWerktage, werktageBetween, addWerktage, DEFAULT_HOLIDAY_REGION } from "@/lib/deadlines";
import { IDS } from "@/lib/ids";
import type { Meeting } from "@/lib/types";
import { verifyItems } from "./items";
import { defaultTitle, emptySteps, isoWeek, type ItemKind, type MeetingChange, type MeetingProtocol, type Participant, type Segment } from "./model";

export const SAMPLE_REF = "MT-2026-0007";

export const SAMPLE_PARTICIPANTS: Participant[] = [
  { name: "Markus Hofmann", role: "Bauleiter (Muster Bau GmbH)", contact_id: null, email: "m.hofmann@muster-bau.example" },
  { name: "Dr. Petra Lang", role: "Bauherr (Immobilien Isar GmbH)", contact_id: null, email: null },
  { name: "Florian Berger", role: "Elektro (vom Bauherrn beauftragt)", contact_id: null, email: null },
  { name: "Thomas Weber", role: "Architekt (Büro Weber Architekten)", contact_id: null, email: null },
];

const H = "Markus Hofmann";
const L = "Dr. Petra Lang";
const B = "Florian Berger";
const W = "Thomas Weber";

/** About 8 minutes of Baubesprechung, the parts that matter. */
export const SAMPLE_SEGMENTS: Segment[] = [
  { speaker: H, start_sec: 4, text: "Guten Morgen zusammen. Baubesprechung, erster Punkt: Stand Elektro im 2. OG." },
  { speaker: B, start_sec: 38, text: "Die Leerrohre und Bodentanks im 2. OG sind noch nicht fertig. Das 2. OG schaffen wir erst Freitag." },
  { speaker: H, start_sec: 71, text: "Dann verschiebt sich unser Estrich im 2. OG entsprechend." },
  { speaker: H, start_sec: 84, text: "Wir halten fest: Estrich 2. OG startet nach Freigabe durch Elektro." },
  { speaker: L, start_sec: 97, text: "Einverstanden." },
  { speaker: L, start_sec: 152, text: "Noch etwas zum 3. OG: Bitte im 3. OG pro Büroeinheit zwei zusätzliche Steckdosen." },
  { speaker: H, start_sec: 171, text: "Das ist eine Zusatzleistung, die zeigen wir vor Beginn als Mehrkosten an." },
  { speaker: W, start_sec: 246, text: "Plan-Revision C für Trockenbau kommt Montag." },
  { speaker: H, start_sec: 263, text: "Gut. Trockenbau im 2. OG läuft nach Plan, keine Mängel bisher." },
  { speaker: H, start_sec: 318, text: "Florian, schick uns bitte bis Mittwoch den aktualisierten Terminplan Elektro." },
  { speaker: B, start_sec: 331, text: "Mache ich." },
  { speaker: L, start_sec: 377, text: "Die Bemusterung der Bodenbeläge machen wir am Donnerstag um zehn, Herr Hofmann organisiert das." },
  { speaker: H, start_sec: 420, text: "Ich schicke das Protokoll heute an alle." },
  { speaker: H, start_sec: 468, text: "Dann danke, das war es für heute." },
];

export const SAMPLE_DURATION_SEC = 482;

/** One extracted item before dates are resolved ("Freitag" → the next Friday). */
export type RawItem = {
  kind: ItemKind;
  text: string;
  quote: string;
  segment: number;
  trade?: string | null;
  area?: string | null;
  owner?: string | null;
  due?: string | null;
  new_end?: string | null;
};

const ELEKTRO = SAMPLE_SEGMENTS[1].text.split(". ")[1];
const STECKDOSEN = "Bitte im 3. OG pro Büroeinheit zwei zusätzliche Steckdosen.";

/** The stored result of MT-2026-0007 (seed, and the offline fallback for the sample). */
export const SAMPLE_RESULT: { summary: string[]; items: RawItem[] } = {
  summary: [
    "Elektro (vom Bauherrn beauftragt) stellt das 2. OG erst Freitag fertig; der Estrich im 2. OG verschiebt sich.",
    "Estrich 2. OG startet erst nach Freigabe durch Elektro.",
    "Bauherr ordnet im 3. OG zwei zusätzliche Steckdosen pro Büroeinheit an; Mehrkosten werden vor Beginn angezeigt.",
    "Architekt liefert Plan-Revision C für den Trockenbau am Montag.",
    "Trockenbau 2. OG läuft nach Plan; keine Mängel festgestellt.",
  ],
  items: [
    { kind: "behinderung", text: "Elektro 2. OG wird erst Freitag fertig; Estricharbeiten 2. OG können bis dahin nicht beginnen.", quote: ELEKTRO, segment: 1, trade: "Elektro", area: "2.OG", new_end: "Freitag" },
    { kind: "termin", text: "Elektroinstallation 2. OG: neues Ende Freitag.", quote: ELEKTRO, segment: 1, trade: "Elektro", area: "2.OG", new_end: "Freitag" },
    { kind: "decision", text: "Estrich 2. OG startet nach Freigabe durch Elektro.", quote: "Estrich 2. OG startet nach Freigabe durch Elektro.", segment: 3 },
    { kind: "anordnung", text: "Im 3. OG pro Büroeinheit zwei zusätzliche Steckdosen.", quote: STECKDOSEN, segment: 5, trade: "Elektro", area: "3.OG" },
    { kind: "mehrkosten", text: "Zwei zusätzliche Steckdosen pro Büroeinheit im 3. OG (Zusatzleistung).", quote: STECKDOSEN, segment: 5, trade: "Elektro", area: "3.OG" },
    { kind: "task", text: "Plan-Revision C für den Trockenbau liefern", quote: "Plan-Revision C für Trockenbau kommt Montag.", segment: 7, owner: "Thomas Weber (Architekt)", due: "Montag", trade: "Trockenbau" },
    { kind: "task", text: "Aktualisierten Terminplan Elektro schicken", quote: "schick uns bitte bis Mittwoch den aktualisierten Terminplan Elektro", segment: 9, owner: "Florian Berger (Elektro)", due: "Mittwoch", trade: "Elektro" },
    { kind: "task", text: "Bemusterung der Bodenbeläge organisieren", quote: "Die Bemusterung der Bodenbeläge machen wir am Donnerstag um zehn", segment: 11, owner: "Markus Hofmann (Bauleiter)", due: "Donnerstag", trade: "Bodenbelag" },
    { kind: "task", text: "Protokoll an alle Teilnehmer schicken", quote: "Ich schicke das Protokoll heute an alle.", segment: 12, owner: "Markus Hofmann (Bauleiter)", due: "heute" },
  ],
};

/** MT-2026-0006: a short NU coordination, two tasks, no letters. */
export const PREVIOUS_SEGMENTS: Segment[] = [
  { speaker: H, start_sec: 3, text: "Koordination Haustechnik: Wo stehen wir mit den Schächten im 3. OG?" },
  { speaker: "Anna Huber", start_sec: 40, text: "Die Bodenbeläge können wir erst nach Belegreife legen, das passt zum Plan." },
  { speaker: H, start_sec: 95, text: "Frau Huber, schicken Sie uns bitte bis Freitag die Muster für den Flur." },
  { speaker: "Marek Nowak", start_sec: 140, text: "Die Schachtwände im 3. OG stellen wir bis Dienstag fertig." },
  { speaker: H, start_sec: 201, text: "Gut, dann sehen wir uns nächste Woche wieder." },
];

export const PREVIOUS_RESULT: { summary: string[]; items: RawItem[] } = {
  summary: ["Bodenbeläge nach Belegreife, im Plan.", "Muster für den Flur kommen bis Freitag.", "Schachtwände 3. OG bis Dienstag fertig."],
  items: [
    { kind: "task", text: "Muster für den Flur schicken", quote: "schicken Sie uns bitte bis Freitag die Muster für den Flur", segment: 2, owner: "Anna Huber (Huber Bodenbeläge)", due: "Freitag", trade: "Bodenbelag" },
    { kind: "task", text: "Schachtwände 3. OG fertigstellen", quote: "Die Schachtwände im 3. OG stellen wir bis Dienstag fertig.", segment: 3, owner: "Marek Nowak (Nowak Trockenbau)", due: "Dienstag", trade: "Trockenbau" },
  ],
};

// ── Seed rows (pure; buildSeed calls this) ───────────────────────────────


const SEED_NOTICE = "Demodaten: Diese Änderungen sind hier nur protokolliert. „Meeting starten“ → „Beispielaufnahme verwenden“ wertet dieselbe Besprechung echt aus und führt sie aus.";

/**
 * MT-2026-0006 (last week) and MT-2026-0007 (yesterday). Their results are
 * recorded history: the seed itself changes no case and no schedule date, so
 * the demo still starts empty. Case links resolve once a matching case exists.
 */
export function buildSeedMeetings(now: Date): Meeting[] {
  const region = DEFAULT_HOLIDAY_REGION;
  const today = berlinDay(now);
  const kw47Day = subWerktage(today, 1, region);
  const kw46Day = subWerktage(today, 6, region);
  const participants = SAMPLE_PARTICIPANTS.map((p) =>
    p.name === "Dr. Petra Lang" ? { ...p, contact_id: IDS.contactBauherr } : p.name === "Thomas Weber" ? { ...p, contact_id: IDS.contactArchitekt } : p,
  );

  // MT-2026-0007: the sample meeting with its stored result.
  let n = 0;
  const items = verifyItems(SAMPLE_RESULT.items, SAMPLE_SEGMENTS, { meetingId: IDS.meetingKw47, baseDay: kw47Day, newId: () => `${IDS.meetingKw47}-i${++n}` }).map((i) =>
    i.kind === "behinderung"
      ? { ...i, updated_case_id: null, case_ref: "KL-2026-0042", case_action: "updated" as const, case_doc_type: "behinderungsanzeige" }
      : i.kind === "anordnung"
        ? { ...i, case_ref: "KL-2026-0043", case_action: "created" as const, case_doc_type: "anordnung_bestaetigung" }
        : i.kind === "mehrkosten"
          ? { ...i, case_ref: "KL-2026-0044", case_action: "created" as const, case_doc_type: "mehrkostenanzeige" }
          : i,
  );
  const friday = items.find((i) => i.kind === "termin")?.new_date ?? addWerktage(kw47Day, 2, region);
  const elektroEnd = subWerktage(today, 2, region); // seed.ts: schedElektro2 end = wt(-2)
  const delay = Math.max(1, werktageBetween(elektroEnd, friday, region));
  const days = `+${delay} ${delay === 1 ? "Arbeitstag" : "Arbeitstage"}`;
  const changes: MeetingChange[] = [
    { kind: "case_updated", text_de: "KL-2026-0042 aktualisiert: voraussichtliches Ende Freitag", case_id: null, case_ref: "KL-2026-0042", case_doc_type: "behinderungsanzeige" },
    { kind: "case_created", text_de: "Neuer Entwurf KL-2026-0043: Bestätigung mündlicher Anordnung", case_id: null, case_ref: "KL-2026-0043", case_doc_type: "anordnung_bestaetigung" },
    { kind: "case_created", text_de: "Neuer Entwurf KL-2026-0044: Mehrkostenanzeige", case_id: null, case_ref: "KL-2026-0044", case_doc_type: "mehrkostenanzeige" },
    { kind: "schedule_updated", text_de: `Termin Elektro 2. OG: ${days}`, case_id: null, case_ref: null },
    { kind: "schedule_updated", text_de: `Termin Estrich 2. OG: ${days}`, case_id: null, case_ref: null },
    { kind: "tasks_created", text_de: "4 Aufgaben angelegt", case_id: null, case_ref: null },
  ];
  const kw47Start = berlinTime(kw47Day, 9, 0);
  const kw47: MeetingProtocol = {
    ref: "MT-2026-0007",
    title: defaultTitle(kw47Start),
    team_id: null,
    participants,
    consent: true,
    started_at: kw47Start.toISOString(),
    ended_at: new Date(kw47Start.getTime() + SAMPLE_DURATION_SEC * 1000).toISOString(),
    duration_sec: SAMPLE_DURATION_SEC,
    status: "ready",
    steps: emptySteps(true),
    summary: SAMPLE_RESULT.summary,
    items,
    changes,
    notice: SEED_NOTICE,
    error: null,
    source: "seed",
    mail: null,
  };

  // MT-2026-0006: a short NU coordination, two tasks, no letters.
  let k = 0;
  const kw46Start = berlinTime(kw46Day, 10, 0);
  const prevItems = verifyItems(PREVIOUS_RESULT.items, PREVIOUS_SEGMENTS, { meetingId: IDS.meetingKw46, baseDay: kw46Day, newId: () => `${IDS.meetingKw46}-i${++k}` });
  const kw46: MeetingProtocol = {
    ref: "MT-2026-0006",
    title: `Koordination Haustechnik KW ${isoWeek(kw46Start)}`,
    team_id: null,
    participants: [
      { name: "Markus Hofmann", role: "Bauleiter (Muster Bau GmbH)", contact_id: null, email: "m.hofmann@muster-bau.example" },
      { name: "Anna Huber", role: "Nachunternehmer (Huber Bodenbeläge GmbH & Co. KG)", contact_id: IDS.contactBodenbelag, email: null },
      { name: "Marek Nowak", role: "Nachunternehmer (Nowak Trockenbau GmbH)", contact_id: IDS.contactTrockenbau, email: null },
    ],
    consent: true,
    started_at: kw46Start.toISOString(),
    ended_at: new Date(kw46Start.getTime() + 214_000).toISOString(),
    duration_sec: 214,
    status: "ready",
    steps: emptySteps(true),
    summary: PREVIOUS_RESULT.summary,
    items: prevItems,
    changes: [{ kind: "tasks_created", text_de: "2 Aufgaben angelegt", case_id: null, case_ref: null }],
    notice: null,
    error: null,
    source: "seed",
    mail: null,
  };

  return [
    { id: IDS.meetingKw46, project_id: IDS.project, type: "nu_koordination", audio_url: null, transcript: { segments: PREVIOUS_SEGMENTS }, protocol: kw46, created_at: kw46Start.toISOString() },
    { id: IDS.meetingKw47, project_id: IDS.project, type: "bauherr", audio_url: null, transcript: { segments: SAMPLE_SEGMENTS }, protocol: kw47, created_at: kw47Start.toISOString() },
  ];
}
