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

export const DOC_TITLE = "Behinderungsanzeige gemäß § 6 Abs. 1 VOB/B (Entwurf)";
export const DOC_REFERENCE = "KL-2026-0042";

export const DOC_FIELDS: DocField[] = [
  { key: "bauvorhaben", label: "Bauvorhaben", value: () => "Wohnanlage Riem, Haus 2", filledAt: 0 },
  { key: "adressat", label: "Adressat", value: () => "Wohnbau Riem GmbH (Bauherr)", filledAt: 4 },
  { key: "beginn", label: "Beginn der Behinderung", value: (d) => `${d}, 07:00 Uhr`, filledAt: 2, mono: true },
  { key: "ursache", label: "Ursache", value: () => "Elektroarbeiten im 2. OG nicht abgeschlossen, Fläche nicht freigegeben", filledAt: 0 },
  { key: "sphaere", label: "Verantwortungssphäre", value: () => "Auftraggeber (Elektro vom Bauherrn beauftragt)", filledAt: 4 },
  { key: "leistungen", label: "Betroffene Leistungen", value: () => "Estricharbeiten 2. OG", filledAt: 0 },
  { key: "personal", label: "Personal", value: () => "4 Facharbeiter", filledAt: 2 },
  { key: "dauer", label: "Voraussichtliche Dauer", value: () => null, filledAt: 7, openLabel: "offen" },
  { key: "foto", label: "Fotodokumentation", value: () => null, filledAt: 7, openLabel: "fehlt" },
  { key: "vorbehalt", label: "Vorbehalt", value: () => "Wir behalten uns Ansprüche auf Bauzeitverlängerung und Mehrkosten vor.", filledAt: 7 },
];

/** Scene 3, after the site manager answers Klara's follow-up. */
export const DOC_COMPLETION: Partial<Record<FieldKey, string>> = {
  dauer: "ca. 2 Arbeitstage",
  foto: "1 Foto · 2. OG, gesperrter Bereich",
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
// Scene 5 renders the real dashboard (src/lib/dashboard), computed from the seed.


export const ECOSYSTEM = {
  inputs: ["Calls in any language", "Morning & evening check-ins", "Meetings", "Emails", "Photos"],
  outputs: ["Daily reports", "VOB/B notices", "Meeting minutes", "Escalations to management", "Dashboards"],
  people: ["Polier", "Bauleiter", "Office", "Management", "Client", "Subcontractors"],
};
