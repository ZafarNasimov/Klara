import type { ReportableDocType } from "@/lib/doctypes";
import type { CauseKind } from "@/lib/rules/sphere";

export const INTENTS = ["report_event", "diary_answer", "answer_question", "confirm", "deny", "smalltalk", "end_call"] as const;
export type Intent = (typeof INTENTS)[number];

export const CAUSE_KINDS = ["trade", "client_provision", "weather", "own", "other", "unknown"] as const;

export type ExtractedEvent = {
  doc_type: ReportableDocType;
  /** The trade that CAUSES the event (not the one affected). */
  trade_name_guess: string | null;
  cause_kind: CauseKind;
  /** Only facts the user actually said, keyed by registry field keys. */
  facts: Record<string, unknown>;
  confidence: number;
};

export type ProgressReport = { trade: string | null; area: string | null; qty: number; unit: string | null; note?: string | null };

/** What the LLM (or the mock) read from one user utterance. */
export type Extraction = {
  intent: Intent;
  events: ExtractedEvent[];
  /** Values that answer Klara's open question or correct an open case, keyed by field. */
  answers: Record<string, unknown>;
  /** Field keys the user said they do not know. */
  declined_fields: string[];
  /** Answer to "Who hired the <trade>?" ("unknown" = the user does not know). */
  hired_by: "client" | "us" | "unknown" | null;
  /** Evening report: quantities per schedule item. */
  progress: ProgressReport[];
  /** Plain diary note in German ("Alles nach Plan"). */
  diary_note: string | null;
  /** ISO 639-1 language of the user's utterance. */
  reply_language: string;
  /** German translation of the utterance (null when it is German). */
  text_de: string | null;
};

export type ExtractContext = {
  nowIso: string;
  /** "Friday, 20.11.2026, 09:30" in Berlin time. */
  nowBerlin: string;
  language: string | null;
  projectName: string;
  trades: string[];
  teamName: string;
  teamTrade: string | null;
  todaysSchedule: string[];
  openCases: { reference: string; doc_type: string; facts: Record<string, unknown>; missing: string[] }[];
  /** Cases already confirmed in this conversation (must not be reported again). */
  documented: { reference: string; doc_type: string }[];
  pendingQuestion: { case_ref: string; doc_type: string; field: string; question_hint: string } | null;
  pendingSphereQuestion: { trade: string | null } | null;
  awaitingConfirm: boolean;
  history: { role: "user" | "klara"; text: string }[];
};

/** What /api/agent/turn returns (client-safe). */
export type TurnResponse = {
  reply: string;
  /** Klara's line in German (subtitle, office view). */
  reply_de: string;
  language: string;
  intent: Intent;
  /** live = Claude, mock = keyword reader (no key), fallback = live call failed. */
  source: "live" | "mock" | "fallback";
  user_turn: import("@/lib/types").Turn;
  klara_turn: import("@/lib/types").Turn;
  /** Cases created or changed in this turn (drafts included). */
  cases: import("@/lib/types").CaseView[];
  awaiting_confirm: boolean;
  /** The readback as structured rows while waiting for the user's yes. */
  confirm: import("@/lib/types").ConfirmView | null;
  question: { case_id: string; field: string } | null;
  ended: boolean;
};
