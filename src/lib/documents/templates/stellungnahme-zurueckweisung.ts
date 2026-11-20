// TODO legal review – draft text for the prototype (SPEC §5.3, D8).
import { dDate, MISSING, str } from "../format";
import type { DocBody } from "../model";
import { letter, type TemplateCtx } from "./context";

export function stellungnahmeZurueckweisung(ctx: TemplateCtx): DocBody {
  const f = ctx.facts;
  const evidence = Array.isArray(f.evidence_bullets) ? (f.evidence_bullets as string[]) : [];
  const blocks: DocBody["blocks"] = [
    { type: "p", text: "wir nehmen Bezug auf Ihr o. g. Schreiben. An unserer Behinderungsanzeige halten wir fest." },
  ];
  if (f.rejection_quote) blocks.push({ type: "quote", text: `„${str(f.rejection_quote)}“` });
  blocks.push({ type: "p", text: "Die Behinderung ist wie folgt dokumentiert:" });
  blocks.push({ type: "bullets", items: evidence.length ? evidence : [MISSING] });
  blocks.push({
    type: "p",
    text: "Wir bitten Sie, die hindernden Umstände umgehend zu beseitigen. Über den Fortbestand der Behinderung informieren wir Sie weiterhin.",
  });
  return letter(ctx, {
    title: `Ihr Schreiben vom ${f.reply_date ? dDate(f.reply_date) : MISSING} – Zurückweisung unserer Behinderungsanzeige vom ${f.orig_date ? dDate(f.orig_date) : MISSING} (Zeichen ${str(f.orig_ref, MISSING)})`,
    blocks,
  });
}
