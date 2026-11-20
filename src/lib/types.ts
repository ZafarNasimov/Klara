// Domain types. Mirrors the data model in SPEC.md §4 plus the few working
// columns the agent needs (conversation.state, case.asked_fields …).
// Client-safe: no server imports here.

export type ContractType = "VOB_B" | "BGB";
export type ContactRole = "bauherr" | "architekt" | "nu" | "intern";
export type UserRole = "polier" | "bauleiter" | "buero" | "gf";
export type ContractedBy = "client" | "us";

export type Company = {
  id: string;
  name: string;
  logo_url: string | null;
  address: string;
};

export type ProjectSettings = {
  /** § 12 Abs. 5 VOB/B fictitious acceptance excluded by contract. */
  fiktive_abnahme_excluded?: boolean;
  /** date-holidays region inside Bavaria ("KATH" = Catholic municipality, e.g. Munich). */
  holiday_region?: string;
  /** Demo clock: milliseconds added to the server clock (SPEC §7). */
  demo_clock_offset_ms?: number;
  /** Tunable voice activity detection for the call screen (SPEC M3). */
  vad?: { silence_ms: number; min_speech_ms: number; positive_threshold: number };
  hourly_rates?: Record<string, number>;
  [key: string]: unknown;
};

export type Project = {
  id: string;
  company_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  contract_type: ContractType;
  contract_no: string;
  contract_date: string; // YYYY-MM-DD
  settings: ProjectSettings;
};

export type Contact = {
  id: string;
  project_id: string;
  name: string;
  organisation: string;
  role: ContactRole;
  email: string;
  has_authority: boolean;
  /** Postal address for the letterhead (organisation address). */
  address: string | null;
};

export type Trade = {
  id: string;
  project_id: string;
  name: string;
  contracted_by: ContractedBy;
  contact_id: string | null;
  team_id: string | null;
};

export type Team = {
  id: string;
  project_id: string;
  name: string;
  lead_user_id: string | null;
};

export type AppUser = {
  id: string;
  name: string;
  role: UserRole;
  language: string;
  email: string | null;
};

export type ScheduleItem = {
  id: string;
  project_id: string;
  trade_id: string;
  activity: string;
  area: string;
  start_date: string;
  end_date: string;
  planned_qty: number | null;
  unit: string | null;
  planned_per_day: number | null;
  depends_on: string[];
};

export type ProgressEntry = {
  id: string;
  schedule_item_id: string;
  date: string;
  actual_qty: number;
  note: string | null;
};

export type ConversationKind = "call" | "chat" | "meeting";

/** Agent working memory for one conversation. */
export type ConversationState = {
  /** Cases opened in this conversation that are not confirmed yet. */
  pending_case_ids: string[];
  /** The field Klara asked about last. */
  asked?: { case_id: string; field: string } | null;
  /** Cases Klara read back; waiting for yes/no. */
  awaiting_confirm?: string[] | null;
  /** Klara asked "Who hired the <trade>?" for this case. */
  asked_sphere?: { case_id: string; trade: string | null } | null;
  /** Clarifying questions asked in a row (to avoid loops). */
  clarify_count?: number;
  /** Low-confidence report kept for the next turn instead of opening a case (SPEC §6.2 step 3). */
  tentative?: { doc_type: string; trade_name_guess: string | null; cause_kind: string; facts: Record<string, unknown> } | null;
  /** Answers to "Who hired the <trade>?", keyed by lower-case canonical trade name. */
  hired_by?: Record<string, "client" | "us" | "unknown">;
};

export type Conversation = {
  id: string;
  team_id: string;
  user_id: string;
  kind: ConversationKind;
  language: string | null;
  status: "open" | "closed";
  started_at: string;
  ended_at: string | null;
  state: ConversationState;
};

export type Turn = {
  id: string;
  conversation_id: string;
  role: "user" | "klara";
  text_original: string;
  text_de: string | null;
  language: string | null;
  audio_url: string | null;
  created_at: string;
};

export type CaseStatus =
  | "entwurf"
  | "unvollstaendig"
  | "bereit"
  | "validiert"
  | "versendet"
  | "beantwortet"
  | "abgeschlossen";

export type Sphere = "client" | "own_sub" | "own_team" | "weather" | "unclear";

export type Light = "green" | "yellow" | "red";

export type CheckResult = {
  id: string;
  label_de: string;
  light: Light;
  /** Every light carries a German reason (SPEC §7). */
  reason_de: string;
};

export type CaseFacts = Record<string, unknown>;

export type Case = {
  id: string;
  project_id: string;
  team_id: string | null;
  conversation_id: string | null;
  doc_type: string;
  status: CaseStatus;
  sphere: Sphere | null;
  facts: CaseFacts;
  missing_fields: string[];
  checks: CheckResult[];
  deadline_at: string | null;
  deadline_rule: string | null;
  parent_case_id: string | null;
  reference: string;
  created_by: string | null;
  /** Fields Klara already asked about (max 3 questions per case). */
  asked_fields: string[];
  /** Fields the user said they do not know. */
  declined_fields: string[];
  /** Internal markers: escalate, internal_risk, suggested … */
  flags: string[];
  created_at: string;
  updated_at: string;
};

export type DocumentVersion = {
  id: string;
  case_id: string;
  version: number;
  body: unknown;
  body_md: string;
  pdf_url: string | null;
  docx_url: string | null;
  sha256: string | null;
  addressee_contact_id: string | null;
  tone: string | null;
  created_at: string;
  validated_by: string | null;
  validated_at: string | null;
  sent_at: string | null;
  delivery_status: string | null;
  immutable: boolean;
};

export type EvidenceKind = "photo" | "weather" | "transcript" | "diary" | "email" | "meeting";

export type Evidence = {
  id: string;
  case_id: string;
  kind: EvidenceKind;
  ref: string | null;
  data: Record<string, unknown>;
  created_at: string;
};

export type EmailOut = {
  id: string;
  case_id: string;
  document_version_id: string | null;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  message_id: string | null;
  sent_at: string | null;
  status: string;
};

export type EmailIn = {
  id: string;
  project_id: string;
  case_id: string | null;
  from_addr: string;
  subject: string;
  body_text: string;
  in_reply_to: string | null;
  message_id: string | null;
  received_at: string;
  classification: Record<string, unknown> | null;
  raw: Record<string, unknown> | null;
};

export type DailyReport = {
  id: string;
  team_id: string;
  date: string;
  data: Record<string, unknown>;
  status: string;
  missing_fields: string[];
};

export type Meeting = {
  id: string;
  project_id: string;
  type: string;
  audio_url: string | null;
  transcript: unknown;
  protocol: unknown;
  created_at: string;
};

/** Timeline / audit log entry. */
export type AppEvent = {
  id: string;
  case_id: string | null;
  project_id: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type Tables = {
  company: Company;
  project: Project;
  contact: Contact;
  trade: Trade;
  team: Team;
  app_user: AppUser;
  schedule_item: ScheduleItem;
  progress_entry: ProgressEntry;
  conversation: Conversation;
  turn: Turn;
  case: Case;
  document_version: DocumentVersion;
  evidence: Evidence;
  email_out: EmailOut;
  email_in: EmailIn;
  daily_report: DailyReport;
  meeting: Meeting;
  event: AppEvent;
};

export type TableName = keyof Tables;

/** Insert order respecting foreign keys (used by seed/reset). */
export const TABLE_ORDER: TableName[] = [
  "company",
  "app_user",
  "project",
  "contact",
  "team",
  "trade",
  "schedule_item",
  "progress_entry",
  "conversation",
  "turn",
  "case",
  "document_version",
  "evidence",
  "email_out",
  "email_in",
  "daily_report",
  "meeting",
  "event",
];

/** Deadline as shown in the UI, recomputed against the demo clock. */
export type DeadlineInfo = { due_at: string | null; status: "ok" | "due_today" | "overdue"; label_de: string };

/** A case as the API returns it: row + read-time deadline + display names. */
export type CaseView = Case & {
  deadline: DeadlineInfo | null;
  team_name: string | null;
  author_name: string | null;
};

/** Structured readback waiting for the user's yes (shown as a card in the chat). */
export type ConfirmView = {
  /** Language of the labels and the user-facing values. */
  language: string;
  docs: {
    case_id: string;
    doc_type: string;
    title_de: string;
    /** Name of the document in the user's language (null when German). */
    title: string | null;
    rows: { key: string; label: string; value: string; value_de: string; mono: boolean }[];
  }[];
};

/** Team channel feed for the mobile app (GET /api/channel/[teamId]). */
export type ChannelFeed = {
  team: Team;
  project_name: string;
  /** Demo clock. */
  now: string;
  llm_mode: "live" | "mock";
  /** The team's open chat with Klara (null until the first message). */
  conversation: Conversation | null;
  /** Language Klara speaks with this team (the chat's, else the lead's preference). */
  language: string;
  turns: Turn[];
  /** Readback waiting for confirmation, if any. */
  confirm: ConfirmView | null;
  /** The team's cases (drafts excluded). */
  cases: CaseView[];
  /** Calls with Klara, newest first. */
  calls: { id: string; started_at: string; ended_at: string | null; turns: number }[];
  today: {
    day: string;
    /** Hour of the demo clock in Berlin (morning / evening cards). */
    hour: number;
    /** "Alles nach Plan" or another note is already in today's diary. */
    diary_done: boolean;
    /** Today's schedule items of the team's own trade, for the evening report. */
    items: { id: string; label: string; unit: string | null; planned_per_day: number | null; actual_today: number | null }[];
  };
};
