// Word version of a letter (SPEC §12: every document as PDF and DOCX).
// Letter only; the internal audit page lives in the PDF.
import "server-only";
import { AlignmentType, BorderStyle, Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { dateDe } from "./templates/kit";
import type { DocBlock, DocBody } from "./types";

const FONT = "Arial";
const SIZE = 21; // half-points: 10.5 pt
const MM = 56.7; // twips per mm

/** Runs with "[fehlt: …]" placeholders in bold amber (missing, DESIGN.md). */
function runs(text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}): TextRun[] {
  return text
    .split(/(\[fehlt: [^\]]+\])/g)
    .filter(Boolean)
    .map((p) =>
      p.startsWith("[fehlt:")
        ? new TextRun({ text: p, bold: true, color: "B45309", font: FONT, size: opts.size ?? SIZE })
        : new TextRun({ text: p, font: FONT, size: opts.size ?? SIZE, bold: opts.bold, italics: opts.italics, color: opts.color }),
    );
}

const para = (text: string, opts: Parameters<typeof runs>[1] & { after?: number; indent?: number } = {}) =>
  new Paragraph({ children: runs(text, opts), spacing: { after: opts.after ?? 120, line: 300 }, indent: opts.indent ? { left: opts.indent } : undefined });

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

function factTable(rows: { label: string; value: string }[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: rows.map(
      (r) =>
        new TableRow({
          children: [
            new TableCell({ width: { size: 32, type: WidthType.PERCENTAGE }, children: [para(r.label, { color: "52525B", after: 60 })] }),
            new TableCell({ width: { size: 68, type: WidthType.PERCENTAGE }, children: [para(r.value, { after: 60 })] }),
          ],
        }),
    ),
  });
}

function block(b: DocBlock): (Paragraph | Table)[] {
  switch (b.kind) {
    case "p":
      return [para(b.text)];
    case "quote":
      return [para(b.text, { italics: true, indent: 8 * MM })];
    case "bullets":
      return b.items.map((i) => para(`– ${i}`, { indent: 4 * MM, after: 60 }));
    case "facts":
      return [factTable(b.rows), para("", { after: 60 })];
  }
}

export async function renderDocx(body: DocBody): Promise<Buffer> {
  const a = body.addressee;
  const children: (Paragraph | Table)[] = [
    new Paragraph({ children: [new TextRun({ text: body.sender.name, bold: true, font: FONT, size: 30 })], spacing: { after: 40 } }),
    para(`${body.sender.address}, Bauleitung`, { size: 16, color: "52525B", after: 480 }),
    para(`${body.sender.name}, ${body.sender.address}`, { size: 14, color: "52525B", after: 80 }),
    ...(a
      ? [a.organisation, a.name, ...(a.address ? a.address.split(/,\s*(?=\d{5})/) : [])].filter((x): x is string => !!x).map((x) => para(x, { after: 0 }))
      : [para("[fehlt: Adressat]")]),
    para("", { after: 240 }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: runs(`${body.place}, ${dateDe(body.date)}`),
      spacing: { after: 240 },
    }),
    ...(body.cc.length ? [para(`Nachrichtlich: ${body.cc.map((p) => [p.name, p.organisation].filter(Boolean).join(", ")).join("; ")}`, { size: 18 })] : []),
    para(body.subject, { bold: true, size: 23, after: 120 }),
    ...body.refs.map((r) => para(`${r.label}: ${r.value}`, { size: 19, after: 20 })),
    para("", { after: 120 }),
    para(body.salutation),
    ...body.blocks.flatMap(block),
    para(body.closing, { after: 600 }),
    para(body.signatory.name, { after: 0 }),
    para(`${body.signatory.role}, ${body.signatory.company}`, { size: 18, color: "52525B" }),
  ];
  const doc = new Document({
    creator: body.sender.name,
    title: `${body.subject} – ${body.reference}`,
    sections: [{ properties: { page: { margin: { top: 18 * MM, bottom: 20 * MM, left: 25 * MM, right: 20 * MM } } }, children }],
  });
  return Packer.toBuffer(doc);
}
