// Shared helpers for the fixed German letter templates (SPEC §5.3).
// TODO legal review: every template text is a prototype draft (SPEC D8).
import { hasValue, type DocTypeDef } from "@/lib/doctypes";
import { fmtDate, fmtNumber, fmtTime } from "@/lib/labels";
import type { Case, Project } from "@/lib/types";
import type { DocBlock } from "../types";

export type TemplateCtx = {
  c: Case;
  def: DocTypeDef;
  project: Project;
  /** Letter date, YYYY-MM-DD (Berlin). */
  letterDate: string;
  /** Reply-by date for confirmations (3 Werktage after the letter). */
  replyBy: string;
  /** The Mehrkostenanzeige opened together with an Anordnungsbestätigung. */
  mehrkosten: Case | null;
  /** The case this one follows up (Behinderungsanzeige for a Wegfall). */
  parent: Case | null;
  /** Labels of required facts that are still missing (collected while rendering). */
  missing: string[];
};

export type TemplateOut = { subject: string; refs?: { label: string; value: string }[]; blocks: DocBlock[] };
export type Template = (t: TemplateCtx) => TemplateOut;

export const dateDe = (day: string) => fmtDate(/^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T12:00:00Z` : day);
export const dateTimeDe = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)} Uhr`;

/** A fact as letter text. Required facts that are missing become "[fehlt: …]" so nobody sends a gap unnoticed. */
export function fact(t: TemplateCtx, key: string): string {
  const f = t.def.fields.find((x) => x.key === key);
  const v = t.c.facts[key];
  if (!f) return hasValue(v) ? String(v) : "";
  if (!hasValue(v)) {
    if (f.unknown_value_de) return f.unknown_value_de;
    if (f.required) {
      t.missing.push(f.label_de);
      return `[fehlt: ${f.label_de}]`;
    }
    return "";
  }
  switch (f.type) {
    case "datetime":
      return typeof v === "string" ? dateTimeDe(v) : String(v);
    case "date":
      return typeof v === "string" ? dateDe(v) : String(v);
    case "number":
      return typeof v === "number" ? fmtNumber(v, Number.isInteger(v) ? 0 : 2) : String(v);
    case "bool":
      return v === true ? "ja" : "nein";
    case "list":
      return Array.isArray(v) ? v.join(", ") : String(v);
    default:
      return String(v).trim();
  }
}

export const has = (t: TemplateCtx, key: string) => hasValue(t.c.facts[key]);

/** Sentence-safe: drop a final period so a value can sit inside a sentence. */
export const bare = (s: string) => s.replace(/[.\s]+$/, "");

export const isVob = (t: TemplateCtx) => t.project.contract_type === "VOB_B";
