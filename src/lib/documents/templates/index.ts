// One fixed German template per document type (SPEC §5). TODO legal review (SPEC D8).
import type { DocTypeId } from "@/lib/doctypes";
import { anordnungBestaetigung } from "./anordnung-bestaetigung";
import { bautagesbericht } from "./bautagesbericht";
import { behinderungEnde } from "./behinderung-ende";
import { behinderungsanzeige } from "./behinderungsanzeige";
import type { Template } from "./kit";
import { infoFolgegewerk } from "./info-folgegewerk";
import { mehrkostenanzeige } from "./mehrkostenanzeige";
import { stellungnahmeZurueckweisung } from "./stellungnahme-zurueckweisung";
import { verzugNu } from "./verzug-nu";

export const TEMPLATES: Partial<Record<DocTypeId, Template>> = {
  behinderungsanzeige,
  behinderung_ende: behinderungEnde,
  mehrkostenanzeige,
  anordnung_bestaetigung: anordnungBestaetigung,
  stellungnahme_zurueckweisung: stellungnahmeZurueckweisung,
  verzug_nu: verzugNu,
  info_folgegewerk: infoFolgegewerk,
  bautagesbericht,
};

export type { Template, TemplateCtx } from "./kit";
