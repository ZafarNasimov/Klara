// German one-liners for timeline events (client-safe).
import { docTitle } from "@/lib/doctypes";
import { EVENT_DE } from "@/lib/labels";
import type { AppEvent } from "@/lib/types";

export function eventTitle(e: AppEvent): string | null {
  return EVENT_DE[e.kind] ?? null;
}

export function eventDetail(e: AppEvent): string | null {
  const p = e.payload as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  switch (e.kind) {
    case "case_created":
    case "case_confirmed":
      return [p.doc_type ? docTitle(String(p.doc_type)) : null, str(p.reference)].filter(Boolean).join(", ") || null;
    case "document_generated":
      return p.version ? `Version ${p.version}` : null;
    case "returned_for_completion":
      return str(p.note);
    case "risk_flag":
    case "deviation":
      return str(p.reason_de);
    case "diary_entry":
      return str(p.text) ?? str(p.summary_de);
    case "progress_recorded":
      return str(p.summary_de);
    case "unsupported_event":
      return p.doc_type ? `${docTitle(String(p.doc_type))}: noch keine Vorlage` : null;
    default:
      return str(p.summary_de) ?? str(p.subject);
  }
}
