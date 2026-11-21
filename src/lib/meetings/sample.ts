// Sample meetings: the seed (MT-2026-0007, MT-2026-0006) and the recording
// behind "Beispielaufnahme verwenden". The sample transcript runs through the
// real pipeline; SAMPLE_RESULT is only the offline fallback (LLM unreachable).
// Names follow the demo project "Neubau Bürogebäude München" (seed.ts).
import type { ItemKind, Participant, Segment } from "./model";

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
