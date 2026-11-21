// One fixed German template per document type (SPEC §5). TODO legal review (SPEC D8).
import type { DocTypeId } from "@/lib/doctypes";
import { anordnungBestaetigung } from "./anordnung-bestaetigung";
import { bautagesbericht } from "./bautagesbericht";
import { behinderungEnde } from "./behinderung-ende";
import { behinderungsanzeige } from "./behinderungsanzeige";
import type { Template } from "./kit";
import { ergaenzung } from "./ergaenzung";
import { infoFolgegewerk } from "./info-folgegewerk";
import { mehrkostenanzeige } from "./mehrkostenanzeige";
import { bedenken, maengelanzeige } from "./meeting-letters";
import { meldung } from "./meldung";
import { stellungnahmeZurueckweisung } from "./stellungnahme-zurueckweisung";
import { verzugNu } from "./verzug-nu";

export const TEMPLATES: Partial<Record<DocTypeId, Template>> = {
  behinderungsanzeige,
  behinderung_ende: behinderungEnde,
  mehrkostenanzeige,
  anordnung_bestaetigung: anordnungBestaetigung,
  stellungnahme_zurueckweisung: stellungnahmeZurueckweisung,
  ergaenzung,
  meldung,
  verzug_nu: verzugNu,
  info_folgegewerk: infoFolgegewerk,
  bautagesbericht,
  maengelanzeige,
  bedenken,
};

export type { Template, TemplateCtx } from "./kit";
