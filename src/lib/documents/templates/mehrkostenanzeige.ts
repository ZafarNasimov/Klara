// TODO legal review – draft text for the prototype (SPEC §5.3, D8).
import { dDate, MISSING, str } from "../format";
import type { DocBody } from "../model";
import { letter, type TemplateCtx } from "./context";

function instructedBy(v: unknown): string {
  const s = str(v, MISSING);
  // "Thomas Weber (Architekt)" → "Herrn Thomas Weber (Architekt)" stays as given; keep it literal.
  return s;
}

export function mehrkostenanzeige(ctx: TemplateCtx): DocBody {
  const f = ctx.facts;
  const est = typeof f.estimate_eur === "number" || (typeof f.estimate_eur === "string" && f.estimate_eur)
    ? `ca. ${Number(f.estimate_eur).toLocaleString("de-DE")} € netto`
    : "– werden derzeit ermittelt –";
  const blocks: DocBody["blocks"] = [
    {
      type: "p",
      text: `am ${f.instruction_date ? dDate(f.instruction_date) : MISSING} wurde durch ${instructedBy(f.instructed_by)} folgende im Vertrag nicht vorgesehene Leistung gefordert:`,
    },
    { type: "quote", text: str(f.description, MISSING) },
    { type: "p", text: "Wir kündigen hiermit vor Beginn der Ausführung unseren Anspruch auf besondere Vergütung an." },
    {
      type: "p",
      text: `Die Mehrkosten betragen nach erster Einschätzung ${est}. Ein Nachtragsangebot reichen wir kurzfristig nach.`,
    },
    { type: "p", text: `Geplanter Ausführungsbeginn: ${f.planned_start ? dDate(f.planned_start) : MISSING}.` },
    { type: "p", text: "Wir bitten um schriftliche Bestätigung der Beauftragung." },
  ];
  return letter(ctx, { title: "Ankündigung eines Anspruchs auf besondere Vergütung gemäß § 2 Abs. 6 Nr. 1 VOB/B", blocks });
}
