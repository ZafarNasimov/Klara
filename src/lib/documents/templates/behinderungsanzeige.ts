// TODO legal review (SPEC D8): fixed text of the Behinderungsanzeige, § 6 Abs. 1 VOB/B.
import { fmtNumber } from "@/lib/labels";
import type { DocBlock } from "../types";
import { bare, fact, has, isVob, type Template } from "./kit";

export const behinderungsanzeige: Template = (t) => {
  const staff = has(t, "idle_staff") ? fmtNumber(Number(t.c.facts.idle_staff)) : fact(t, "idle_staff");
  const equipment = has(t, "idle_equipment") ? ` sowie ${bare(fact(t, "idle_equipment"))}` : "";
  const weather = t.c.sphere === "weather";
  const blocks: DocBlock[] = [
    { kind: "p", text: "hiermit zeigen wir Ihnen an, dass wir in der ordnungsgemäßen Ausführung unserer vertraglichen Leistungen behindert sind." },
    {
      kind: "facts",
      rows: [
        { label: "Beginn der Behinderung", value: fact(t, "start_at") },
        { label: "Bereich", value: fact(t, "area") },
        { label: "Hindernde Umstände", value: fact(t, "cause") },
        { label: "Betroffene Leistungen", value: fact(t, "affected_works") },
        { label: "Auswirkungen", value: `Derzeit sind ${staff} Arbeitskräfte${equipment} ohne Einsatzmöglichkeit.` },
        { label: "Voraussichtliche Dauer", value: fact(t, "expected_duration") },
      ],
    },
  ];
  if (weather) {
    blocks.push({ kind: "p", text: "Die Behinderung beruht auf den Witterungsverhältnissen am Tag des Ereignisses. Die Wetterdaten sind dokumentiert." });
  } else {
    blocks.push({ kind: "p", text: "Wir bitten Sie, die hindernden Umstände umgehend zu beseitigen." });
  }
  blocks.push({
    kind: "p",
    text: isVob(t)
      ? "Die vereinbarten Ausführungsfristen verlängern sich gemäß § 6 Abs. 2 und 4 VOB/B entsprechend."
      : "Die vereinbarten Ausführungsfristen verlängern sich entsprechend.",
  });
  if (t.c.sphere === "client") {
    blocks.push({
      kind: "p",
      text: isVob(t)
        ? "Die Geltendmachung weiterer Ansprüche, insbesondere nach § 6 Abs. 6 VOB/B und § 642 BGB, behalten wir uns ausdrücklich vor."
        : "Die Geltendmachung weiterer Ansprüche, insbesondere nach § 642 BGB, behalten wir uns ausdrücklich vor.",
    });
  }
  blocks.push({ kind: "p", text: "Sobald die Behinderung entfällt, nehmen wir die Arbeiten unverzüglich wieder auf und informieren Sie hierüber." });
  return { subject: isVob(t) ? "Behinderungsanzeige gemäß § 6 Abs. 1 VOB/B" : "Behinderungsanzeige", blocks };
};
