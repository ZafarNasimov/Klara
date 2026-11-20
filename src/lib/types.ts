// Domain types mirroring the data model in SPEC.md §4.

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
  fiktive_abnahme_excluded?: boolean;
  /** Demo clock: milliseconds added to the real clock (SPEC §7). */
  demo_clock_offset_ms?: number;
  /** Tunable VAD settings for the call screen (SPEC M3). */
  vad?: { silence_ms: number; min_speech_ms: number; positive_threshold: number };
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
  contract_date: string; // ISO date
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
  address?: string | null;
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

export type Conversation = {
  id: string;
  team_id: string;
  user_id: string;
  kind: ConversationKind;
  language: string | null;
  status: "open" | "closed";
  started_at: string;
  ended_at: string | null;
  /** Agent working memory: which case is being asked about, question counts, pending readback. */
  state: ConversationState;
};

export type ConversationState = {
  /** Cases opened in this conversation that still need answers or confirmation. */
  pending_case_ids: string[];
  /** Case + field Klara asked about last. */
  asked?: { case_id: string; field: string } | null;
  /** Case ids Klara read back and awaits a yes/no for. */
  awaiting_confirm?: string[] | null;
  /** Pending sphere question ("Who hired the <trade>?"). */
  asked_sphere?: { case_id: string; trade: string } | null;
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
  /** Number of questions Klara asked for this case (max 3). */
  questions_asked: number;
  /** Internal flags, e.g. escalate, internal_risk. */
  flags: string[];
  created_at: string;
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
