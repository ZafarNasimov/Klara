// TODO legal review – draft text for the prototype (SPEC §5.3, D8).
import { addWerktage, berlinDay } from "@/lib/deadlines";
import { dDate, dDateTime, MISSING, str } from "../format";
import type { DocBody } from "../model";
import { letter, type TemplateCtx } from "./context";

export function verzugNu(ctx: TemplateCtx): DocBody {
  const f = ctx.facts;
  const deadline = dDate(addWerktage(berlinDay(ctx.now), 2));
  const rows: [string, string][] = [
    ["Seit", f.start_at ? `${dDateTime(f.start_at)} Uhr` : MISSING],
    ["Bereich", str(f.area, MISSING)],
    ["Sachverhalt", str(f.cause, MISSING)],
  ];
  if (f.affected_works) rows.push(["Betroffene Folgeleistungen", str(f.affected_works)]);
  if (f.idle_staff) rows.push(["Auswirkungen", `${str(f.idle_staff)} Arbeitskräfte ohne Einsatzmöglichkeit`]);
  return letter(ctx, {
    title: "Aufforderung zur Abhilfe gemäß § 5 Abs. 3 VOB/B",
    blocks: [
      { type: "p", text: "auf der o. g. Baustelle stellen wir fest, dass Ihre vertraglichen Leistungen nicht vertragsgemäß erbracht werden:" },
      { type: "fields", rows },
      {
        type: "p",
        text: `Wir fordern Sie auf, unverzüglich, spätestens bis ${deadline}, ausreichend Personal und Gerät einzusetzen und die Leistungen fristgerecht fortzuführen.`,
      },
      {
        type: "p",
        text: "Für Schäden und Mehrkosten, die uns aus der Verzögerung entstehen, behalten wir uns die Geltendmachung ausdrücklich vor (§ 5 Abs. 4, § 6 Abs. 6 VOB/B).",
      },
    ],
  });
}
