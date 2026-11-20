import type { DocBody } from "../model";
import { anordnungBestaetigung } from "./anordnung-bestaetigung";
import { bautagesbericht } from "./bautagesbericht";
import { behinderungEnde } from "./behinderung-ende";
import { behinderungsanzeige } from "./behinderungsanzeige";
import type { TemplateCtx } from "./context";
import { mehrkostenanzeige } from "./mehrkostenanzeige";
import { stellungnahmeZurueckweisung } from "./stellungnahme-zurueckweisung";
import { verzugNu } from "./verzug-nu";

export type { TemplateCtx } from "./context";

export const TEMPLATES: Record<string, (ctx: TemplateCtx) => DocBody> = {
  behinderungsanzeige,
  behinderung_ende: behinderungEnde,
  mehrkostenanzeige,
  anordnung_bestaetigung: anordnungBestaetigung,
  stellungnahme_zurueckweisung: stellungnahmeZurueckweisung,
  bautagesbericht,
  verzug_nu: verzugNu,
};
