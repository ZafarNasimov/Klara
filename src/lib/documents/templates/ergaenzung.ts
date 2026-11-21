// TODO legal review (SPEC D8): Ergänzende Angaben auf eine Rückfrage des Auftraggebers.
import { fact, type Template } from "./kit";

export const ergaenzung: Template = (t) => {
  const items = Array.isArray(t.c.facts.requested_items) ? (t.c.facts.requested_items as string[]) : [];
  return {
    subject: `Ihr Schreiben vom ${fact(t, "reply_date")} – ergänzende Angaben zu unserem Schreiben vom ${fact(t, "orig_date")} (Zeichen ${fact(t, "orig_reference")})`,
    blocks: [
      { kind: "p", text: "mit o. g. Schreiben baten Sie um folgende Angaben:" },
      items.length ? { kind: "bullets", items } : { kind: "p", text: fact(t, "requested_items") },
      { kind: "p", text: "Hierzu teilen wir Ihnen mit:" },
      { kind: "p", text: fact(t, "answers") },
    ],
    refs: t.parent ? [{ label: "Bezug", value: `Unser Schreiben vom ${fact(t, "orig_date")}, Zeichen ${t.parent.reference}` }] : [],
  };
};
