// TODO legal review – draft text for the prototype (SPEC §5.3, D8).
import { addWerktage, berlinDay } from "@/lib/deadlines";
import { dDate, dTime, MISSING, str } from "../format";
import type { DocBody } from "../model";
import { letter, type TemplateCtx } from "./context";

export function anordnungBestaetigung(ctx: TemplateCtx): DocBody {
  const f = ctx.facts;
  const replyBy = dDate(addWerktage(berlinDay(ctx.now), 3));
  const time = f.instruction_time ? `${dTime(f.instruction_time)} Uhr` : null;
  const place = str(f.place, "Baustelle");
  const blocks: DocBody["blocks"] = [
    {
      type: "p",
      text: `am ${f.instruction_date ? dDate(f.instruction_date) : MISSING}${time ? ` um ${time}` : ""} hat ${str(f.instructed_by, MISSING)} auf der Baustelle (${place}) folgende Anordnung erteilt:`,
    },
    { type: "quote", text: `„${str(f.instruction_text, MISSING)}“` },
  ];
  if (f.witnesses) blocks.push({ type: "p", text: `Anwesend: ${str(f.witnesses)}` });
  blocks.push({
    type: "p",
    text: `Wir bestätigen hiermit den Erhalt dieser Anordnung und bitten Sie als Auftraggeber um schriftliche Bestätigung bis ${replyBy}.`,
  });
  if (ctx.project.contract_type === "BGB") {
    blocks.push({ type: "p", text: "Wir bitten um Bestätigung der Anordnung in Textform (§ 650b Abs. 2 BGB)." });
  }
  const mk = ctx.linkedMehrkosten;
  if (mk) {
    blocks.push({
      type: "p",
      text: `Zu den Mehrkosten verweisen wir auf unsere gesonderte Anzeige vom ${dDate(mk.created_at)} (Zeichen ${mk.reference}).`,
    });
  }
  return letter(ctx, { title: "Bestätigung einer mündlichen Anordnung", blocks });
}
