// DOCX from the same document model (SPEC §2: docx package). Letter only.
import "server-only";
import { AlignmentType, BorderStyle, Document, Footer, Packer, Paragraph, TextRun } from "docx";
import type { DocBody, Party } from "./model";

const FONT = "Arial";
const run = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, font: FONT, size: opts.size ?? 21, bold: opts.bold, italics: opts.italics, color: opts.color });

const lines = (p: Party) => [p.organisation, p.name, p.address].filter(Boolean) as string[];

export async function renderDocx(b: DocBody): Promise<Buffer> {
  const children: Paragraph[] = [];
  children.push(
    new Paragraph({
      children: [run(b.sender.company, { bold: true, size: 26 })],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "E4E4E7", space: 4 } },
    }),
    new Paragraph({ children: [run(b.sender.address, { size: 17, color: "52525B" })], spacing: { after: 360 } }),
  );
  if (b.addressee) for (const l of lines(b.addressee)) children.push(new Paragraph({ children: [run(l)] }));
  if (b.cc.length) {
    children.push(
      new Paragraph({
        children: [run(`Kopie: ${b.cc.map((c) => [c.name, c.organisation].filter(Boolean).join(", ")).join("; ")}`, { size: 17, color: "52525B" })],
        spacing: { before: 120 },
      }),
    );
  }
  children.push(new Paragraph({ children: [run(b.place_date)], alignment: AlignmentType.RIGHT, spacing: { before: 360, after: 240 } }));
  children.push(new Paragraph({ children: [run(b.title, { bold: true, size: 24 })], spacing: { after: 120 } }));
  for (const l of b.subject_lines) children.push(new Paragraph({ children: [run(l)] }));
  children.push(new Paragraph({ children: [], spacing: { after: 200 } }));
  if (b.salutation) children.push(new Paragraph({ children: [run(b.salutation)], spacing: { after: 160 } }));

  for (const block of b.blocks) {
    switch (block.type) {
      case "p":
        children.push(new Paragraph({ children: [run(block.text)], spacing: { after: 160 } }));
        break;
      case "quote":
        children.push(new Paragraph({ children: [run(block.text, { italics: true })], indent: { left: 400 }, spacing: { after: 160 } }));
        break;
      case "bullets":
        for (const it of block.items) children.push(new Paragraph({ children: [run(`– ${it}`)], indent: { left: 200 } }));
        children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
        break;
      case "fields":
        for (const [k, v] of block.rows) children.push(new Paragraph({ children: [run(`${k}: `, { bold: true }), run(v)] }));
        children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
        break;
    }
  }
  children.push(new Paragraph({ children: [run(b.closing)], spacing: { before: 200, after: 480 } }));
  children.push(new Paragraph({ children: [run(b.signatory.name)] }));
  children.push(new Paragraph({ children: [run(b.signatory.role, { size: 17, color: "52525B" })] }));

  const doc = new Document({
    creator: b.sender.company,
    title: `${b.title} – ${b.reference}`,
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1250, right: 1250 } } },
        footers: { default: new Footer({ children: [new Paragraph({ children: [run(`Zeichen ${b.reference}`, { size: 15, color: "71717A" })] })] }) },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
