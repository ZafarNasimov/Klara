// Sample meetings: the seed (MT-2026-0007, MT-2026-0006) and the recording
// behind "Beispielaufnahme verwenden". The sample transcript runs through the
// real pipeline; SAMPLE_RESULT is only the offline fallback (LLM unreachable).
// Names follow the demo project, Baustelle B "Wohnanlage Riem, Haus 2" (seed.ts). The
// sample is multilingual: German, Russian, Polish and Serbian.
import { berlinDay, berlinTime, subWerktage, DEFAULT_HOLIDAY_REGION } from "@/lib/deadlines";
import { IDS } from "@/lib/ids";
import type { Meeting } from "@/lib/types";
import { verifyItems } from "./items";
import { finalizeSegment } from "./language";
import { defaultTitle, emptySteps, isoWeek, sortLanguages, type ItemKind, type MeetingChange, type MeetingProtocol, type Participant, type Segment } from "./model";

export const SAMPLE_REF = "MT-2026-0007";

export const SAMPLE_PARTICIPANTS: Participant[] = [
  { name: "Markus Hofmann", role: "Bauleiter (Muster Bau GmbH)", contact_id: null, email: "m.hofmann@muster-bau.example" },
  { name: "Sergej Iwanow", role: "Polier Estrich (Muster Bau GmbH)", contact_id: null, email: null },
  { name: "Tomasz Wiśniewski", role: "Elektro (Elektro Berger GmbH, vom Bauherrn beauftragt)", contact_id: null, email: null },
  { name: "Dr. Petra Lang", role: "Bauherr (Wohnbau Riem GmbH)", contact_id: null, email: null },
  { name: "Dragan Petrović", role: "Polier Trockenbau (Nowak Trockenbau GmbH, unser NU)", contact_id: null, email: null },
  { name: "Thomas Weber", role: "Architekt (Büro Weber Architekten)", contact_id: null, email: null },
];

const H = "Markus Hofmann";
const I = "Sergej Iwanow";
const E = "Tomasz Wiśniewski";
const L = "Dr. Petra Lang";
const D = "Dragan Petrović";
const W = "Thomas Weber";

/** A segment as the recognizer delivers it: words as said, not yet translated. */
const said = (speaker: string, start_sec: number, end_sec: number, text_original: string): Segment => ({
  speaker,
  start_sec,
  end_sec,
  language: null,
  text_original,
  text_de: null,
  confidence: null,
  notes: [],
});

/**
 * About 8 minutes of a multilingual Baubesprechung, as recorded: everyone
 * speaks their own language (DE, RU, PL, SR), and the Trockenbau-Polier
 * switches to German later. "Beispielaufnahme verwenden" sends exactly this
 * through the real translation and extraction.
 */
export const SAMPLE_RECORDING: Segment[] = [
  said(H, 4, 19, "Guten Morgen zusammen. Erster Punkt: Stand im 2. OG."),
  said(I, 21, 35, "Третий этаж до сих пор не освобождён, мы стоим с утра."),
  said(H, 37, 43, "Herr Wiśniewski, wie sieht es bei Elektro aus?"),
  said(E, 44, 52, "Drugie piętro skończymy dopiero w piątek."),
  said(H, 71, 82, "Dann verschiebt sich unser Estrich im 2. OG entsprechend."),
  said(H, 84, 95, "Wir halten fest: Estrich 2. OG startet nach Freigabe durch Elektro."),
  said(L, 97, 99, "Einverstanden."),
  said(L, 152, 168, "Noch etwas zum 3. OG: Bitte im 3. OG pro Wohnung zwei zusätzliche Steckdosen."),
  said(H, 171, 184, "Das ist eine Zusatzleistung, die zeigen wir vor Beginn als Mehrkosten an."),
  said(D, 205, 214, "Bez revizije C ne možemo da počnemo na trećem spratu."),
  said(W, 246, 252, "Plan-Revision C für Trockenbau kommt Montag."),
  said(D, 263, 272, "Im 2. OG läuft Trockenbau nach Plan, keine Mängel bisher."),
  said(H, 318, 328, "Herr Wiśniewski, schicken Sie uns bitte bis Mittwoch den aktualisierten Terminplan Elektro."),
  said(E, 331, 333, "Dobrze, zrobię to."),
  said(L, 377, 388, "Die Bemusterung der Bodenbeläge machen wir am Donnerstag um zehn, Herr Hofmann organisiert das."),
  said(H, 420, 424, "Ich schicke das Protokoll heute an alle."),
  said(H, 468, 472, "Dann danke, das war es für heute."),
];

/** Stored translation (seed, and the offline fallback for the sample). */
const STORED: Record<number, { language: string; text_de: string }> = {
  1: { language: "ru", text_de: "Das 2. OG ist immer noch nicht frei, wir stehen seit heute Morgen." },
  3: { language: "pl", text_de: "Das 2. OG schaffen wir erst Freitag." },
  9: { language: "sr", text_de: "Ohne Revision C können wir im 3. OG nicht anfangen." },
  13: { language: "pl", text_de: "Gut, mache ich." },
};

/** The sample after the translation step (floor notes come from floors.ts). */
export const SAMPLE_SEGMENTS: Segment[] = SAMPLE_RECORDING.map((s, i) =>
  finalizeSegment(s, STORED[i] ? { ...STORED[i], confidence: 0.92 } : { language: "de", text_de: s.text_original, confidence: 0.96 }),
);

export const SAMPLE_DURATION_SEC = 482;

/** One extracted item before dates are resolved ("Freitag" → the next Friday). */
export type RawItem = {
  kind: ItemKind;
  text: string;
  /** Verbatim from the German text of `segment`. */
  quote_de: string;
  /** Verbatim from the original words of `segment` (any language). */
  quote_original?: string | null;
  segment: number;
  /** Other segments that independently say the same (evidence besides `segment`). */
  support?: number[] | null;
  /** task: the segment whose statement waits for this task. */
  depends_on?: number | null;
  trade?: string | null;
  area?: string | null;
  owner?: string | null;
  due?: string | null;
  new_end?: string | null;
};

const ELEKTRO = { quote_de: "Das 2. OG schaffen wir erst Freitag.", quote_original: "Drugie piętro skończymy dopiero w piątek.", segment: 3, support: [1] };
const STECKDOSEN = { quote_de: "Bitte im 3. OG pro Wohnung zwei zusätzliche Steckdosen.", segment: 7 };

/** The stored result of MT-2026-0007 (seed, and the offline fallback for the sample). */
export const SAMPLE_RESULT: { summary: string[]; items: RawItem[] } = {
  summary: [
    "Das 2. OG ist noch nicht frei: Elektro (vom Bauherrn beauftragt) wird erst Freitag fertig, unser Estrich steht seit heute Morgen.",
    "Estrich 2. OG startet nach Freigabe durch Elektro.",
    "Bauherr ordnet im 3. OG zwei zusätzliche Steckdosen pro Wohnung an; Mehrkosten werden vor Beginn angezeigt.",
    "Trockenbau 3. OG kann erst mit Plan-Revision C beginnen; der Architekt liefert sie am Montag.",
    "Trockenbau 2. OG läuft nach Plan, keine Mängel.",
  ],
  items: [
    { kind: "behinderung", text: "Elektro 2. OG wird erst Freitag fertig; Estricharbeiten 2. OG können bis dahin nicht beginnen.", ...ELEKTRO, trade: "Elektro", area: "2.OG", new_end: "Freitag" },
    { kind: "termin", text: "Elektroinstallation 2. OG: neues Ende Freitag.", ...ELEKTRO, trade: "Elektro", area: "2.OG", new_end: "Freitag" },
    { kind: "decision", text: "Estrich 2. OG startet nach Freigabe durch Elektro.", quote_de: "Estrich 2. OG startet nach Freigabe durch Elektro.", segment: 5 },
    { kind: "anordnung", text: "Im 3. OG pro Wohnung zwei zusätzliche Steckdosen.", ...STECKDOSEN, trade: "Elektro", area: "3.OG" },
    { kind: "mehrkosten", text: "Zwei zusätzliche Steckdosen pro Wohnung im 3. OG (Zusatzleistung).", ...STECKDOSEN, trade: "Elektro", area: "3.OG" },
    { kind: "task", text: "Plan-Revision C für den Trockenbau liefern", quote_de: "Plan-Revision C für Trockenbau kommt Montag.", segment: 10, depends_on: 9, owner: "Thomas Weber (Büro Weber Architekten)", due: "Montag", trade: "Trockenbau" },
    { kind: "task", text: "Aktualisierten Terminplan Elektro schicken", quote_de: "schicken Sie uns bitte bis Mittwoch den aktualisierten Terminplan Elektro", segment: 12, owner: "Tomasz Wiśniewski (Elektro)", due: "Mittwoch", trade: "Elektro" },
    { kind: "task", text: "Bemusterung der Bodenbeläge organisieren", quote_de: "Die Bemusterung der Bodenbeläge machen wir am Donnerstag um zehn", segment: 14, owner: "Markus Hofmann (Bauleiter)", due: "Donnerstag", trade: "Bodenbelag" },
    { kind: "task", text: "Protokoll an alle Teilnehmer schicken", quote_de: "Ich schicke das Protokoll heute an alle.", segment: 15, owner: "Markus Hofmann (Bauleiter)", due: "heute" },
  ],
};

/** A German segment as stored (no translation needed). */
const de = (speaker: string, start_sec: number, end_sec: number, text: string): Segment => ({
  speaker,
  start_sec,
  end_sec,
  language: "de",
  text_original: text,
  text_de: text,
  confidence: 0.96,
  notes: [],
});

/** MT-2026-0006: a short NU coordination, two tasks, no letters. */
export const PREVIOUS_SEGMENTS: Segment[] = [
  de(H, 3, 12, "Koordination Haustechnik: Wo stehen wir mit den Schächten im 3. OG?"),
  de("Anna Huber", 40, 49, "Die Bodenbeläge können wir erst nach Belegreife legen, das passt zum Plan."),
  de(H, 95, 102, "Frau Huber, schicken Sie uns bitte bis Freitag die Muster für den Flur."),
  de("Marek Nowak", 140, 146, "Die Schachtwände im 3. OG stellen wir bis Dienstag fertig."),
  de(H, 201, 205, "Gut, dann sehen wir uns nächste Woche wieder."),
];

export const PREVIOUS_RESULT: { summary: string[]; items: RawItem[] } = {
  summary: ["Bodenbeläge nach Belegreife, im Plan.", "Muster für den Flur kommen bis Freitag.", "Schachtwände 3. OG bis Dienstag fertig."],
  items: [
    { kind: "task", text: "Muster für den Flur schicken", quote_de: "schicken Sie uns bitte bis Freitag die Muster für den Flur", segment: 2, owner: "Anna Huber (Huber Bodenbeläge)", due: "Freitag", trade: "Bodenbelag" },
    { kind: "task", text: "Schachtwände 3. OG fertigstellen", quote_de: "Die Schachtwände im 3. OG stellen wir bis Dienstag fertig.", segment: 3, owner: "Marek Nowak (Nowak Trockenbau)", due: "Dienstag", trade: "Trockenbau" },
  ],
};

// ── Seed rows (pure; buildSeed calls this) ───────────────────────────────


const SEED_NOTICE = "Protokoll aus der Demo-Historie: Vorlagen sind hier nur festgehalten, es wurden keine Vorgänge angelegt. „Meeting starten“ → „Beispielaufnahme verwenden“ wertet dieselbe Besprechung echt aus und legt die Vorgänge an.";

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

  // MT-2026-0007: the sample meeting with its stored result, as history only.
  // It names no case numbers and changed nothing: on a fresh demo the live
  // call creates KL-…-0042 today, and a seeded meeting from yesterday must
  // not claim to have updated it.
  let n = 0;
  const items = verifyItems(SAMPLE_RESULT.items, SAMPLE_SEGMENTS, { meetingId: IDS.meetingKw47, baseDay: kw47Day, newId: () => `${IDS.meetingKw47}-i${++n}` }).map((i) =>
    i.kind === "termin" ? { ...i, case_action: "noop" as const } : i,
  );
  const changes: MeetingChange[] = [{ kind: "tasks_created", text_de: `${items.filter((i) => i.kind === "task").length} Aufgaben angelegt`, case_id: null, case_ref: null }];
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
    languages: sortLanguages(SAMPLE_SEGMENTS.map((s) => s.language)),
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
    languages: ["de"],
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
