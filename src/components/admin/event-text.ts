// German one-liners for timeline events (client-safe).
import { docTitle } from "@/lib/doctypes";
import { $t, $tx } from "@/lib/i18n";
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
      return p.version ? $t("Version {n}", { n: String(p.version) }) : null;
    case "returned_for_completion":
      return str(p.note) ? $tx(str(p.note)) : null;
    case "risk_flag":
    case "deviation":
      return str(p.reason_de) ? $tx(str(p.reason_de)) : null;
    case "diary_entry":
      return $tx(str(p.text) ?? str(p.summary_de)) || null;
    case "progress_recorded":
      return str(p.summary_de) ? $tx(str(p.summary_de)) : null;
    case "unsupported_event":
      return p.doc_type ? $t("{doc}: noch keine Vorlage", { doc: docTitle(String(p.doc_type)) }) : null;
    default:
      return $tx(str(p.summary_de) ?? str(p.subject)) || null;
  }
}
