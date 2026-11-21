// TODO legal review (SPEC D8): letters drafted from meeting notes.
import type { DocBlock } from "../types";
import { bare, dateDe, fact, has, type Template } from "./kit";

const sourceLine = (t: Parameters<Template>[0]): DocBlock[] =>
  has(t, "source") ? [{ kind: "p", text: `Festgehalten in der ${bare(fact(t, "source"))}.` }] : [];

export const maengelanzeige: Template = (t) => {
  const blocks: DocBlock[] = [
    {
      kind: "p",
      text: `am ${fact(t, "noticed_at")} haben wir an Ihrer Leistung${has(t, "area") ? ` (${bare(fact(t, "area"))})` : ""} folgenden Mangel festgestellt:`,
    },
    { kind: "quote", text: `„${bare(fact(t, "defect"))}“` },
    ...sourceLine(t),
    {
      kind: "p",
      text: `Wir fordern Sie auf, den Mangel bis zum ${dateDe(t.replyBy)} zu beseitigen und uns die Beseitigung schriftlich mitzuteilen (§ 4 Abs. 7 VOB/B).`,
    },
  ];
  return { subject: "Mängelanzeige", blocks };
};

export const bedenken: Template = (t) => {
  const blocks: DocBlock[] = [
    {
      kind: "p",
      text: `gegen die vorgesehene Ausführung${has(t, "area") ? ` (${bare(fact(t, "area"))})` : ""} haben wir am ${fact(t, "raised_at")} folgende Bedenken geäußert:`,
    },
    { kind: "quote", text: `„${bare(fact(t, "concern"))}“` },
    ...sourceLine(t),
    {
      kind: "p",
      text: `Wir melden hiermit Bedenken nach § 4 Abs. 3 VOB/B an und bitten um Ihre Entscheidung bis zum ${dateDe(t.replyBy)}, wie ausgeführt werden soll.`,
    },
  ];
  return { subject: "Bedenkenanzeige", blocks };
};
