// TODO legal review (SPEC D8): Stellungnahme zur Zurückweisung einer Behinderungsanzeige.
import { dateDe, fact, type Template } from "./kit";

export const stellungnahmeZurueckweisung: Template = (t) => {
  const bullets = Array.isArray(t.c.facts.evidence_bullets) ? (t.c.facts.evidence_bullets as string[]) : [];
  return {
    subject: `Ihr Schreiben vom ${fact(t, "reply_date")} – Zurückweisung unserer Behinderungsanzeige vom ${fact(t, "orig_date")} (Zeichen ${fact(t, "orig_reference")})`,
    blocks: [
      { kind: "p", text: "wir nehmen Bezug auf Ihr o. g. Schreiben. An unserer Behinderungsanzeige halten wir fest." },
      { kind: "p", text: "Die Behinderung ist wie folgt dokumentiert:" },
      bullets.length ? { kind: "bullets", items: bullets } : { kind: "p", text: fact(t, "evidence_bullets") },
      {
        kind: "p",
        text: "Wir bitten Sie, die hindernden Umstände umgehend zu beseitigen. Über den Fortbestand der Behinderung informieren wir Sie weiterhin.",
      },
    ],
    refs: t.parent ? [{ label: "Bezug", value: `Unsere Behinderungsanzeige vom ${dateDe(t.parent.created_at)}, Zeichen ${t.parent.reference}` }] : [],
  };
};
