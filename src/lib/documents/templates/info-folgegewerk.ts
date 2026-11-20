// TODO legal review (SPEC D8): Information an ein Folgegewerk über eine voraussichtliche Terminverschiebung.
import { fmtNumber } from "@/lib/labels";
import { bare, fact, type Template } from "./kit";

export const infoFolgegewerk: Template = (t) => {
  const days = Number(t.c.facts.forecast_delay_days ?? 0);
  return {
    subject: `Voraussichtliche Terminverschiebung ${bare(fact(t, "successor"))}`,
    blocks: [
      {
        kind: "p",
        text: `nach dem aktuellen Leistungsstand vom ${fact(t, "report_date")} verzögert sich die Vorleistung ${bare(fact(t, "predecessor"))} voraussichtlich um ca. ${fmtNumber(days)} Arbeitstage.`,
      },
      { kind: "facts", rows: [{ label: "Grundlage", value: fact(t, "basis") }] },
      {
        kind: "p",
        text: `Ihr Ausführungsbeginn ${bare(fact(t, "successor"))} verschiebt sich damit voraussichtlich vom ${fact(t, "planned_start")} auf den ${fact(t, "new_start")}.`,
      },
      { kind: "p", text: "Bitte berücksichtigen Sie dies in Ihrer Personal- und Materialplanung. Den verbindlichen Termin teilen wir Ihnen mit, sobald er feststeht." },
    ],
  };
};
