// The registry: every document type Klara knows (SPEC §5).
import { anordnungBestaetigung } from "./anordnung-bestaetigung";
import { bautagesbericht } from "./bautagesbericht";
import { behinderungEnde } from "./behinderung-ende";
import { behinderungsanzeige } from "./behinderungsanzeige";
import { mehrkostenanzeige } from "./mehrkostenanzeige";
import { stellungnahmeZurueckweisung } from "./stellungnahme-zurueckweisung";
import type { DocTypeDef, DocTypeId, FieldDef } from "./types";
import { verzugNu } from "./verzug-nu";

export * from "./types";

export const REGISTRY: Record<DocTypeId, DocTypeDef> = {
  behinderungsanzeige,
  behinderung_ende: behinderungEnde,
  mehrkostenanzeige,
  anordnung_bestaetigung: anordnungBestaetigung,
  stellungnahme_zurueckweisung: stellungnahmeZurueckweisung,
  bautagesbericht,
  verzug_nu: verzugNu,
};

export function getDocType(id: string): DocTypeDef | null {
  return (REGISTRY as Record<string, DocTypeDef>)[id] ?? null;
}

/** Doc types the agent may open from a site report (record_turn enum). */
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

export function userFields(def: DocTypeDef): FieldDef[] {
  return def.fields.filter((f) => (f.source ?? "user") === "user");
}

export function hasValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
