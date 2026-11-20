import type { Intent } from "./prompt";

export type ExtractedEvent = {
  doc_type: string;
  trade_name_guess?: string | null;
  cause_kind?: "trade" | "weather" | "other" | "unknown";
  facts: Record<string, unknown>;
  confidence: number;
};

export type Extraction = {
  intent: Intent;
  events: ExtractedEvent[];
  answer_facts?: Record<string, unknown>;
  declined_fields?: string[];
  reply_language?: string;
  text_de?: string;
};

/** What the extractor gets to see besides the utterance. */
export type ExtractContext = {
  nowIso: string;
  nowBerlin: string;
  language: string | null;
  projectName: string;
  trades: string[];
  teamName: string;
  teamTrade: string | null;
  todaysSchedule: string[];
  pendingQuestion: { case_ref: string; doc_type: string; field: string; question_hint: string } | null;
  pendingSphereQuestion: { trade: string | null } | null;
  awaitingConfirm: boolean;
  openCases: { reference: string; doc_type: string; facts: Record<string, unknown>; missing: string[] }[];
  history: { role: "user" | "klara"; text: string }[];
};
