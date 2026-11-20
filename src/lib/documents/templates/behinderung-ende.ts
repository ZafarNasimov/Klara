// TODO legal review (SPEC D8): Anzeige über den Wegfall der Behinderung, § 6 Abs. 3 VOB/B.
import type { DocBlock } from "../types";
import { dateDe, fact, has, isVob, type Template } from "./kit";

export const behinderungEnde: Template = (t) => {
  const parent = t.parent;
  const blocks: DocBlock[] = [
    {
      kind: "p",
      text: parent
        ? `hiermit zeigen wir Ihnen an, dass die mit unserem Schreiben vom ${dateDe(parent.created_at)} (Zeichen ${parent.reference}) angezeigte Behinderung entfallen ist.`
        : "hiermit zeigen wir Ihnen an, dass die von uns angezeigte Behinderung entfallen ist.",
    },
    {
      kind: "facts",
      rows: [
        { label: "Wegfall der Behinderung", value: fact(t, "end_at") },
        { label: "Wiederaufnahme der Arbeiten", value: fact(t, "resumed_at") },
        ...(has(t, "still_affected") ? [{ label: "Fortwirkende Folgen", value: fact(t, "still_affected") }] : []),
      ],
    },
    { kind: "p", text: "Die Dauer der Behinderung sowie die Ausfallzeiten von Personal und Geräten sind in unseren Bautagesberichten dokumentiert." },
  ];
  if (parent?.sphere === "client") {
    blocks.push({
      kind: "p",
      text: isVob(t)
        ? "Die Verlängerung der Ausführungsfristen gemäß § 6 Abs. 4 VOB/B sowie die mit unserer Behinderungsanzeige vorbehaltenen Ansprüche bleiben unberührt."
        : "Die Verlängerung der Ausführungsfristen sowie die mit unserer Behinderungsanzeige vorbehaltenen Ansprüche bleiben unberührt.",
    });
  }
  return {
    subject: isVob(t) ? "Anzeige über den Wegfall der Behinderung gemäß § 6 Abs. 3 VOB/B" : "Anzeige über den Wegfall der Behinderung",
    refs: parent ? [{ label: "Bezug", value: `Unsere Behinderungsanzeige vom ${dateDe(parent.created_at)}, Zeichen ${parent.reference}` }] : [],
    blocks,
  };
};
