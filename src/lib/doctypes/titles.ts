// German titles for every doc type id (SPEC §5.1). Client-safe.
export const DOC_TITLES: Record<string, string> = {
  behinderungsanzeige: "Behinderungsanzeige",
  behinderung_ende: "Anzeige Wegfall der Behinderung",
  mehrkostenanzeige: "Ankündigung Mehrvergütung",
  anordnung_bestaetigung: "Bestätigung mündlicher Anordnung",
  stellungnahme_zurueckweisung: "Stellungnahme zur Zurückweisung",
  bautagesbericht: "Bautagesbericht",
  bedenkenanzeige: "Bedenkenanzeige",
  verzug_nu: "Abhilfeaufforderung an NU",
  info_folgegewerk: "Information an Folgegewerke",
  leistung_ohne_auftrag: "Anzeige Leistung ohne Auftrag",
  stundenlohn_anzeige: "Anzeige Stundenlohnarbeiten",
  maengelanzeige_nu: "Mängelanzeige an NU",
  besprechungsprotokoll: "Baubesprechungsprotokoll",
  protokoll_widerspruch: "Widerspruch gegen Protokoll",
  diary_only: "Tagebucheintrag",
};

export const docTitle = (id: string) => DOC_TITLES[id] ?? id;
