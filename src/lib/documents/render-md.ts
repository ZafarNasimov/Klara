import type { AuditData, DocBody, Party } from "./model";

const partyLines = (p: Party) => [p.organisation, p.name, p.address].filter(Boolean) as string[];

/** Markdown of the letter (page 1). This text is what sha256 is computed over. */
export function renderMarkdown(b: DocBody): string {
  const out: string[] = [];
  out.push(`**${b.sender.company}**, ${b.sender.address}`, "");
  if (b.addressee) out.push(...partyLines(b.addressee).map((l) => `${l}  `), "");
  if (b.cc.length) out.push(`Kopie: ${b.cc.map((c) => [c.name, c.organisation].filter(Boolean).join(", ")).join("; ")}`, "");
  out.push(b.place_date, "");
  out.push(`## ${b.title}`, "");
  out.push(...b.subject_lines.map((l) => `${l}  `), "");
  if (b.salutation) out.push(b.salutation, "");
  for (const block of b.blocks) {
    switch (block.type) {
      case "p":
        out.push(block.text, "");
        break;
      case "quote":
        out.push(`> ${block.text}`, "");
        break;
      case "bullets":
        out.push(...block.items.map((i) => `- ${i}`), "");
        break;
      case "fields":
        out.push(...block.rows.map(([k, v]) => `**${k}:** ${v}  `), "");
        break;
    }
  }
  out.push(b.closing, "", b.signatory.name, b.signatory.role);
  return out.join("\n").trim() + "\n";
}

export function renderAuditMarkdown(a: AuditData): string {
  const out = [
    "## Interne Prüfseite (nicht zum Versand)",
    "",
    a.marker,
    "",
    `SHA-256 (Seite 1): \`${a.sha256}\``,
    `Version: ${a.version}`,
    ...a.timestamps.map(([k, v]) => `${k}: ${v}`),
    a.weather ? `Wetter: ${a.weather}` : "",
    "",
    "### Gesprächsprotokoll",
    ...a.transcript.map((t) => `- ${t.at} ${t.role === "user" ? "Meldung" : "Klara"}: ${t.text}${t.text_de && t.text_de !== t.text ? ` (DE: ${t.text_de})` : ""}`),
  ];
  return out.filter((l) => l !== "").join("\n");
}
