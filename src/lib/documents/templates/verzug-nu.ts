// TODO legal review (SPEC D8): Abhilfeaufforderung an den eigenen Nachunternehmer, § 5 Abs. 3 VOB/B.
import type { DocBlock } from "../types";
import { bare, fact, has, isVob, type Template } from "./kit";

export const verzugNu: Template = (t) => {
  const blocks: DocBlock[] = [
    { kind: "p", text: "auf unserer Baustelle stellen wir fest, dass die Ausführung Ihrer vertraglichen Leistungen nicht wie vereinbart erfolgt:" },
    {
      kind: "facts",
      rows: [
        { label: "Seit", value: fact(t, "start_at") },
        { label: "Bereich", value: fact(t, "area") },
        { label: "Sachverhalt", value: fact(t, "cause") },
        ...(has(t, "affected_works") ? [{ label: "Betroffene Leistungen", value: fact(t, "affected_works") }] : []),
      ],
    },
    {
      kind: "p",
      text: `Wir fordern Sie auf, unverzüglich, spätestens bis zum ${bare(fact(t, "remedy_until"))}, Abhilfe zu schaffen und die Arbeiten mit ausreichendem Personal fortzusetzen${isVob(t) ? " (§ 5 Abs. 3 VOB/B)" : ""}.`,
    },
    {
      kind: "p",
      text: "Die Verzögerung behindert nachfolgende Gewerke. Wir behalten uns vor, Ihnen die daraus entstehenden Mehrkosten und Schäden in Rechnung zu stellen.",
    },
    { kind: "p", text: "Bitte bestätigen Sie uns kurzfristig, ab wann Ihre Kolonne wieder auf der Baustelle ist." },
  ];
  return { subject: isVob(t) ? "Aufforderung zur Abhilfe gemäß § 5 Abs. 3 VOB/B" : "Aufforderung zur Abhilfe", blocks };
};
