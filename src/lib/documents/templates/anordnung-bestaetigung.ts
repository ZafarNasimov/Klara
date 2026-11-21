// TODO legal review (SPEC D8): Bestätigung einer mündlichen Anordnung (Beweissicherung; BGB § 650b Abs. 2 Textform).
import type { DocBlock } from "../types";
import { bare, dateDe, fact, has, type Template } from "./kit";

export const anordnungBestaetigung: Template = (t) => {
  // An instruction that came in writing (the client's e-mail, SPEC §6.4) is not "mündlich" and not "auf der Baustelle".
  const written = t.c.facts._via === "email";
  const time = has(t, "instruction_time") ? ` um ${bare(fact(t, "instruction_time")).replace(/\s*Uhr$/i, "")} Uhr` : "";
  const place = written ? "per E-Mail" : has(t, "place") ? `auf der Baustelle (${bare(fact(t, "place"))})` : "auf der Baustelle";
  const blocks: DocBlock[] = [
    {
      kind: "p",
      text: `am ${fact(t, "instruction_date")}${time} hat ${bare(fact(t, "instructed_by"))} ${place} folgende Anordnung erteilt:`,
    },
    { kind: "quote", text: `„${bare(fact(t, "instruction_text"))}“` },
  ];
  if (has(t, "witnesses")) blocks.push({ kind: "p", text: `Anwesend: ${bare(fact(t, "witnesses"))}.` });
  blocks.push({
    kind: "p",
    text: `Wir bestätigen hiermit den Erhalt dieser Anordnung und bitten Sie als Auftraggeber um schriftliche Bestätigung bis zum ${dateDe(t.replyBy)}.`,
  });
  if (t.project.contract_type === "BGB") {
    blocks.push({ kind: "p", text: "Wir bitten um Bestätigung der Anordnung in Textform (§ 650b Abs. 2 BGB)." });
  }
  if (t.mehrkosten) {
    blocks.push({
      kind: "p",
      text: `Zu den Mehrkosten verweisen wir auf unsere gesonderte Anzeige vom ${dateDe(t.mehrkosten.created_at)} (Zeichen ${t.mehrkosten.reference}).`,
    });
  }
  return { subject: written ? "Bestätigung Ihrer Anordnung" : "Bestätigung einer mündlichen Anordnung", blocks };
};
