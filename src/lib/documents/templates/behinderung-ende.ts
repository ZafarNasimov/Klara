// TODO legal review – draft text for the prototype (SPEC §5.3, D8).
import { dDate, dDateTime, MISSING, str } from "../format";
import type { DocBody } from "../model";
import { letter, type TemplateCtx } from "./context";

export function behinderungEnde(ctx: TemplateCtx): DocBody {
  const f = ctx.facts;
  const parent = ctx.parent;
  const blocks: DocBody["blocks"] = [
    {
      type: "p",
      text: parent
        ? `wir nehmen Bezug auf unsere Behinderungsanzeige vom ${dDate(parent.created_at)} (Zeichen ${parent.reference}) und zeigen Ihnen hiermit an, dass die Behinderung entfallen ist.`
        : "hiermit zeigen wir Ihnen an, dass die von uns angezeigte Behinderung entfallen ist.",
    },
    {
      type: "fields",
      rows: [
        ["Ende der Behinderung", f.end_at ? `${dDateTime(f.end_at)} Uhr` : MISSING],
        ["Wiederaufnahme der Arbeiten", f.resumed_at ? `${dDateTime(f.resumed_at)} Uhr` : "unverzüglich"],
        ...(f.still_affected ? ([["Weiterhin beeinträchtigt", str(f.still_affected)]] as [string, string][]) : []),
      ],
    },
    { type: "p", text: "Gemäß § 6 Abs. 3 VOB/B haben wir die Arbeiten unverzüglich wieder aufgenommen." },
    {
      type: "p",
      text: "Die Auswirkungen der Behinderung auf Bauzeit und Kosten sind dokumentiert. Die Geltendmachung daraus resultierender Ansprüche behalten wir uns vor.",
    },
  ];
  return letter(ctx, { title: "Anzeige über den Wegfall der Behinderung gemäß § 6 Abs. 3 VOB/B", blocks });
}
