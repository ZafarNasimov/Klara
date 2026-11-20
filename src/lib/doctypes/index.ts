// The registry: every document type Klara knows (SPEC §5). Client-safe.
import { anordnungBestaetigung } from "./anordnung-bestaetigung";
import { behinderungEnde } from "./behinderung-ende";
import { behinderungsanzeige } from "./behinderungsanzeige";
import { mehrkostenanzeige } from "./mehrkostenanzeige";
import { bautagesbericht, infoFolgegewerk, stellungnahmeZurueckweisung, verzugNu } from "./others";
import type { DocTypeDef, DocTypeId, FieldDef } from "./types";

export * from "./types";

export const REGISTRY: Record<DocTypeId, DocTypeDef> = {
  behinderungsanzeige,
  behinderung_ende: behinderungEnde,
  mehrkostenanzeige,
  anordnung_bestaetigung: anordnungBestaetigung,
  stellungnahme_zurueckweisung: stellungnahmeZurueckweisung,
  bautagesbericht,
  verzug_nu: verzugNu,
  info_folgegewerk: infoFolgegewerk,
};

export function getDocType(id: string): DocTypeDef | null {
  return (REGISTRY as Record<string, DocTypeDef>)[id] ?? null;
}

export function requireDocType(id: string): DocTypeDef {
  const d = getDocType(id);
  if (!d) throw new Error(`Unbekannter Dokumenttyp: ${id}`);
  return d;
}

/** record_turn doc_type enum (SPEC §6.2). Recognized even when no template exists yet. */
export const REPORTABLE_DOC_TYPES = [
  "behinderungsanzeige",
  "behinderung_ende",
  "mehrkostenanzeige",
  "anordnung_bestaetigung",
  "bedenkenanzeige",
  "leistung_ohne_auftrag",
  "stundenlohn_anzeige",
  "maengelanzeige_nu",
  "diary_only",
  "none",
] as const;
export type ReportableDocType = (typeof REPORTABLE_DOC_TYPES)[number];

/** Recognized in a report but not built in the prototype (office gets a note). */
export const NOT_BUILT_DE: Record<string, string> = {
  bedenkenanzeige: "Bedenkenanzeige (§ 4 Abs. 3 VOB/B)",
  leistung_ohne_auftrag: "Anzeige einer Leistung ohne Auftrag (§ 2 Abs. 8 VOB/B)",
  stundenlohn_anzeige: "Anzeige Stundenlohnarbeiten (§ 15 Abs. 3 VOB/B)",
  maengelanzeige_nu: "Mängelanzeige an Nachunternehmer (§ 4 Abs. 7 VOB/B)",
};

export function docTitle(id: string): string {
  return getDocType(id)?.title_de ?? NOT_BUILT_DE[id] ?? id;
}

/** Fields Klara may ask the user about. */
export function userFields(def: DocTypeDef): FieldDef[] {
  return def.fields.filter((f) => (f.source ?? "user") === "user");
}

export function fieldLabel(docType: string, key: string): string {
  return getDocType(docType)?.fields.find((f) => f.key === key)?.label_de ?? key;
}

export function hasValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}
