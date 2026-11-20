// A letter as structured data (SPEC §5.3). The same body renders to Markdown,
// PDF and DOCX, and its Markdown is what the sha256 covers. Client-safe.

export type DocBlock =
  | { kind: "p"; text: string }
  /** Label/value rows ("Beginn der Behinderung: 20.11.2026, 07:00 Uhr"). */
  | { kind: "facts"; rows: { label: string; value: string }[] }
  | { kind: "quote"; text: string }
  | { kind: "bullets"; items: string[] }
  /** Section title inside a report ("Personal", "Ausgeführte Leistungen"). */
  | { kind: "heading"; text: string }
  /** Grid with a header row; `numeric` columns are right-aligned. An empty table prints `empty`. */
  | { kind: "table"; columns: { label: string; numeric?: boolean }[]; rows: string[][]; empty?: string }
  /** Signature boxes (role, printed name, "Datum, Unterschrift" line). */
  | { kind: "signatures"; parties: { role: string; name: string | null }[] };

export type DocParty = { name: string; organisation: string | null; address: string | null };

export type DocBody = {
  doc_type: string;
  /** "report" (Bautagesbericht): a form without address window, salutation and closing. Default "letter". */
  form?: "letter" | "report";
  /** Betreff, first line bold. */
  subject: string;
  reference: string;
  /** Letter date (YYYY-MM-DD, Berlin). */
  date: string;
  place: string;
  sender: { name: string; address: string };
  addressee: DocParty | null;
  cc: DocParty[];
  /** Bauvorhaben, Vertrag, Unser Zeichen, Bezug … */
  refs: { label: string; value: string }[];
  salutation: string;
  blocks: DocBlock[];
  closing: string;
  signatory: { name: string; role: string; company: string };
  /** Required facts that are still missing; rendered as "[fehlt: …]". */
  missing: string[];
};
