// TODO legal review – draft text for the prototype (SPEC §5.3, D8). Fixed sentences; the LLM never rewrites them.
import { dDateTime, MISSING, str } from "../format";
import type { DocBody } from "../model";
import { letter, type TemplateCtx } from "./context";

export function behinderungsanzeige(ctx: TemplateCtx): DocBody {
  const f = ctx.facts;
  const staff = str(f.idle_staff, MISSING);
  const equipment = str(f.idle_equipment);
  const costReservation = ctx.c.sphere === "client" && f.cost_reservation !== false;
  const blocks: DocBody["blocks"] = [
    {
      type: "p",
      text: "hiermit zeigen wir Ihnen an, dass wir in der ordnungsgemäßen Ausführung unserer vertraglichen Leistungen behindert sind.",
    },
    {
      type: "fields",
      rows: [
        ["Beginn der Behinderung", f.start_at ? `${dDateTime(f.start_at)} Uhr` : MISSING],
        ["Bereich", str(f.area, MISSING)],
        ["Hindernde Umstände", str(f.cause, MISSING)],
        ["Betroffene Leistungen", str(f.affected_works, MISSING)],
        ["Auswirkungen", `Derzeit sind ${staff} Arbeitskräfte${equipment ? ` sowie ${equipment}` : ""} ohne Einsatzmöglichkeit.`],
        ["Voraussichtliche Dauer", str(f.expected_duration, "derzeit nicht absehbar")],
      ],
    },
    { type: "p", text: "Wir bitten Sie, die hindernden Umstände umgehend zu beseitigen." },
    { type: "p", text: "Die vereinbarten Ausführungsfristen verlängern sich gemäß § 6 Abs. 2 und 4 VOB/B entsprechend." },
  ];
  if (costReservation) {
    blocks.push({
      type: "p",
      text: "Die Geltendmachung weiterer Ansprüche, insbesondere nach § 6 Abs. 6 VOB/B und § 642 BGB, behalten wir uns ausdrücklich vor.",
    });
  }
  blocks.push({
    type: "p",
    text: "Sobald die Behinderung entfällt, nehmen wir die Arbeiten unverzüglich wieder auf und informieren Sie hierüber.",
  });
  return letter(ctx, { title: "Behinderungsanzeige gemäß § 6 Abs. 1 VOB/B", blocks });
}
