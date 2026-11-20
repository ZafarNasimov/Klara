// TODO legal review – draft layout for the prototype; fields per VHB Bund RL 411.
import { dDate, MISSING, str } from "../format";
import type { DocBody } from "../model";
import { letter, type TemplateCtx } from "./context";

export function bautagesbericht(ctx: TemplateCtx): DocBody {
  const f = ctx.facts;
  const work = Array.isArray(f.work_performed) ? (f.work_performed as string[]) : f.work_performed ? [str(f.work_performed)] : [];
  return letter(ctx, {
    title: `Bautagesbericht vom ${f.date ? dDate(f.date) : MISSING}`,
    salutation: "",
    closing: "Aufgestellt",
    blocks: [
      {
        type: "fields",
        rows: [
          ["Witterung", str(f.weather, MISSING)],
          ["Poliere", str(f.staff_polier, "0")],
          ["Facharbeiter", str(f.staff_facharbeiter, MISSING)],
          ["Helfer", str(f.staff_helfer, "0")],
          ["Geräte", str(f.equipment, "–")],
          ["Lieferungen", str(f.deliveries, "–")],
          ["Anordnungen", str(f.instructions, "keine")],
          ["Besondere Vorkommnisse", str(f.incidents, "keine")],
        ],
      },
      { type: "p", text: "Ausgeführte Leistungen:" },
      { type: "bullets", items: work.length ? work : [MISSING] },
    ],
  });
}
