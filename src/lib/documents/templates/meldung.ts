// Internal note: a site report Klara could not place in a letter type. A form, not a letter.
import type { DocBlock } from "../types";
import { fact, has, type Template } from "./kit";

export const meldung: Template = (t) => {
  const conf = typeof t.c.facts._confidence === "number" ? Math.round(t.c.facts._confidence * 100) : null;
  const blocks: DocBlock[] = [
    {
      kind: "facts",
      rows: [
        { label: "Meldung", value: fact(t, "report") },
        { label: "Bereich", value: has(t, "area") ? fact(t, "area") : "nicht angegeben" },
        { label: "Auswirkung", value: has(t, "impact") ? fact(t, "impact") : "nicht angegeben" },
      ],
    },
    {
      kind: "p",
      text: `Klara konnte diese Meldung keinem Schreiben sicher zuordnen${conf !== null ? ` (Erkennung ${conf} %)` : ""}. Bitte anhand des Gesprächsprotokolls prüfen, ob eine Anzeige nötig ist, z. B. eine Behinderungsanzeige.`,
    },
  ];
  return { subject: "Meldung von der Baustelle zur Prüfung", blocks, form: "report" };
};
