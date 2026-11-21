// One story across the pitch (content spec, 2026-11-21): Baustelle B
// "Wohnanlage Riem", team Estrich, the client's electricians block the 2nd
// floor since 07:00, crew of 4; missing = expected duration + photo.
// Pitch text is English; documents and app content are German. All names
// are fictional.

export type Speaker = "foreman" | "klara";
export type CallLine = { who: Speaker; text: string };

/** Scene 2 replay script (exact). One click plays one exchange (two lines). */
export const CALL_SCRIPT: CallLine[] = [
  { who: "foreman", text: "Hi Klara, quick update from site B. The electricians still haven't cleared the second floor, so my screed crew can't start." },
  { who: "klara", text: "Understood. Since when is the second floor blocked, and how many people are waiting?" },
  { who: "foreman", text: "Since seven this morning. Four guys." },
  { who: "klara", text: "Who hired the electricians — the client or us?" },
  { who: "foreman", text: "The client." },
  { who: "klara", text: "Then it's a hindrance on the client's side. Let me confirm: since 7 a.m., second floor blocked by the client's electricians, screed work stopped, crew of four. Correct?" },
  { who: "foreman", text: "Correct." },
  { who: "klara", text: "I've prepared the obstruction notice. Expected duration and a photo are still open — I've flagged them for your site manager." },
];

export const CALL_EXCHANGES = CALL_SCRIPT.length / 2;

/** "21.11.2026": the pitch is always "today". */
export const todayDE = () => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());

export type FieldKey =
  | "bauvorhaben"
  | "adressat"
  | "beginn"
  | "ursache"
  | "sphaere"
  | "leistungen"
  | "personal"
  | "dauer"
  | "foto"
  | "vorbehalt";

export type DocField = {
  key: FieldKey;
  label: string;
  /** Filled value; null = still open in the draft. */
  value: (today: string) => string | null;
  /** Script line (0-based) whose words fill this field. */
  filledAt: number;
  /** For the two open fields: the amber word shown once Klara flags them. */
  openLabel?: "offen" | "fehlt";
  mono?: boolean;
};

/**
 * The case's facts: the single source for the form (Scenes 2–3) and the
 * generated letter (Scene 3.5). The form shows them as fields; the letter
 * template turns the same values into sentences. Nothing is typed twice.
 */
export const CASE = {
  reference: "KL-2026-0042",
  bauvorhaben: "Wohnanlage Riem, Haus 2",
  client: "Wohnbau Riem GmbH",
  clientAddress: ["Riemer Straße 12", "81829 München"],
  contractNo: "WR-2026-114",
  sender: { company: "Muster Bau GmbH", unit: "Bauleitung", address: "Musterstraße 1, 80331 München", city: "München", signer: "Tobias Bauer", signerRole: "Bauleiter" },
  startTime: "07:00",
  area: "2. OG",
  /** The client's trade whose unfinished work blocks us. */
  blockingWork: "Elektroarbeiten",
  blockingTrade: "Elektro",
  affectedWork: "Estricharbeiten",
  crew: 4,
  crewRole: "Facharbeiter",
  duration: "ca. 2 Arbeitstage",
  photo: { count: 1, label: "2. OG, gesperrter Bereich" },
  vorbehalt: "Wir behalten uns Ansprüche auf Bauzeitverlängerung und Mehrkosten vor.",
} as const;

export const DOC_TITLE = "Behinderungsanzeige gemäß § 6 Abs. 1 VOB/B (Entwurf)";
export const DOC_REFERENCE = CASE.reference;

export const DOC_FIELDS: DocField[] = [
  { key: "bauvorhaben", label: "Bauvorhaben", value: () => CASE.bauvorhaben, filledAt: 0 },
  { key: "adressat", label: "Adressat", value: () => `${CASE.client} (Bauherr)`, filledAt: 4 },
  { key: "beginn", label: "Beginn der Behinderung", value: (d) => `${d}, ${CASE.startTime} Uhr`, filledAt: 2, mono: true },
  { key: "ursache", label: "Ursache", value: () => `${CASE.blockingWork} im ${CASE.area} nicht abgeschlossen, Fläche nicht freigegeben`, filledAt: 0 },
  { key: "sphaere", label: "Verantwortungssphäre", value: () => `Auftraggeber (${CASE.blockingTrade} vom Bauherrn beauftragt)`, filledAt: 4 },
  { key: "leistungen", label: "Betroffene Leistungen", value: () => `${CASE.affectedWork} ${CASE.area}`, filledAt: 0 },
  { key: "personal", label: "Personal", value: () => `${CASE.crew} ${CASE.crewRole}`, filledAt: 2 },
  { key: "dauer", label: "Voraussichtliche Dauer", value: () => null, filledAt: 7, openLabel: "offen" },
  { key: "foto", label: "Fotodokumentation", value: () => null, filledAt: 7, openLabel: "fehlt" },
  { key: "vorbehalt", label: "Vorbehalt", value: () => CASE.vorbehalt, filledAt: 7 },
];

/** Scene 3, after the site manager answers Klara's follow-up. */
export const DOC_COMPLETION: Partial<Record<FieldKey, string>> = {
  dauer: CASE.duration,
  foto: `${CASE.photo.count} Foto · ${CASE.photo.label}`,
};

export const CALL_CAPABILITIES = [
  "Speaks the foreman's language — the report is always German",
  "Asks follow-up questions until nothing is missing",
  "Picks the right report type (VOB/B)",
  "Checks who is responsible: client, subcontractor or own team",
  "Nothing is sent without human approval",
];

/** Scene 3 project tree (fictional). */
export const SITES = [
  { id: "A", name: "Neubau Bürogebäude Schwabing", teams: ["Rohbau", "Ausbau"] },
  { id: "B", name: "Wohnanlage Riem", teams: ["Estrich", "Trockenbau", "Haustechnik"] },
  { id: "C", name: "Schule Pasing", teams: ["Rohbau", "Fassade"] },
] as const;

export const CLARIFY_REQUEST = "Please add the expected duration and a photo of the blocked area.";
export const CLARIFY_RECIPIENTS = ["Site manager", "Project manager", "Client"] as const;
export const CLARIFY_MESSAGE_DE =
  "Bitte ergänzen: voraussichtliche Dauer der Behinderung und ein Foto des gesperrten Bereichs (2. OG).";
export const CLARIFY_MESSAGE_EN =
  "Please add: expected duration of the hindrance and a photo of the blocked area (2nd floor).";

/** Scene 5 seed data. Table rows add up to the KPI row. */
export const KPIS = [
  { label: "Open cases", value: 7 },
  { label: "Missing reports today", value: 3 },
  { label: "Notices sent this week", value: 5 },
  { label: "Delay days at risk", value: 6 },
] as const;

export const TRADE_PROGRESS = [
  { trade: "Elektro", plan: 85, actual: 72, highlight: true },
  { trade: "Sanitär", plan: 60, actual: 64, highlight: false },
  { trade: "Trockenbau", plan: 45, actual: 40, highlight: false },
  { trade: "Estrich", plan: 55, actual: 38, highlight: false },
] as const;

export const TEAM_ROWS = [
  { site: "A", siteName: "Schwabing", team: "Rohbau", open: 1, missing: 0, delay: 0 },
  { site: "A", siteName: "Schwabing", team: "Ausbau", open: 1, missing: 1, delay: 1 },
  { site: "B", siteName: "Riem", team: "Estrich", open: 2, missing: 0, delay: 3, highlight: true },
  { site: "B", siteName: "Riem", team: "Trockenbau", open: 1, missing: 1, delay: 1 },
  { site: "B", siteName: "Riem", team: "Haustechnik", open: 0, missing: 0, delay: 0 },
  { site: "C", siteName: "Pasing", team: "Rohbau", open: 1, missing: 1, delay: 1 },
  { site: "C", siteName: "Pasing", team: "Fassade", open: 1, missing: 0, delay: 0 },
] as const;

export const ECOSYSTEM = {
  inputs: ["Calls in any language", "Morning & evening check-ins", "Meetings", "Emails", "Photos"],
  outputs: ["Daily reports", "VOB/B notices", "Meeting minutes", "Escalations to management", "Dashboards"],
  people: ["Polier", "Bauleiter", "Office", "Management", "Client", "Subcontractors"],
};
