// TODO legal review (SPEC D8): Ankündigung Mehrvergütung, § 2 Abs. 6 Nr. 1 VOB/B.
import { fmtNumber } from "@/lib/labels";
import { bare, fact, has, isVob, type Template } from "./kit";

export const mehrkostenanzeige: Template = (t) => {
  const started = t.c.facts.work_started === true;
  return {
    subject: isVob(t)
      ? "Ankündigung eines Anspruchs auf besondere Vergütung gemäß § 2 Abs. 6 Nr. 1 VOB/B"
      : "Ankündigung eines Anspruchs auf Mehrvergütung",
    blocks: [
      {
        kind: "p",
        text: `am ${fact(t, "instruction_date")} wurde durch ${bare(fact(t, "instructed_by"))} folgende im Vertrag nicht vorgesehene Leistung gefordert:`,
      },
      { kind: "quote", text: fact(t, "description") },
      {
        kind: "p",
        // A start before the notice is flagged red in the checks; the letter must not claim otherwise.
        text: started
          ? "Wir kündigen hiermit unseren Anspruch auf besondere Vergütung an."
          : "Wir kündigen hiermit vor Beginn der Ausführung unseren Anspruch auf besondere Vergütung an.",
      },
      {
        kind: "p",
        text: has(t, "estimate_eur")
          ? `Die Mehrkosten betragen nach erster Einschätzung ca. ${fmtNumber(Number(t.c.facts.estimate_eur))}\u00a0€ netto. Ein Nachtragsangebot reichen wir kurzfristig nach.`
          : "Die Höhe der Mehrkosten wird derzeit ermittelt. Ein Nachtragsangebot reichen wir kurzfristig nach.",
      },
      { kind: "p", text: `Geplanter Ausführungsbeginn: ${fact(t, "planned_start")}.` },
      { kind: "p", text: "Wir bitten um schriftliche Bestätigung der Beauftragung." },
    ],
  };
};
