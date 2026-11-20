// One document model, rendered to Markdown, PDF and DOCX (SPEC §2, §5.3).
export type Block =
  | { type: "p"; text: string }
  | { type: "fields"; rows: [string, string][] }
  | { type: "quote"; text: string }
  | { type: "bullets"; items: string[] };

export type Party = { name: string; organisation?: string | null; address?: string | null };

export type DocBody = {
  doc_type: string;
  title: string;
  subject_lines: string[]; // Bauvorhaben, Vertrag, Unser Zeichen …
  sender: { company: string; address: string };
  addressee: Party | null;
  cc: Party[];
  place_date: string; // "München, 20.11.2026"
  salutation: string;
  blocks: Block[];
  closing: string;
  signatory: { name: string; role: string };
  reference: string;
};

/** Internal audit page (page 2). Never attached to outgoing mail by default (SPEC §5.3, D9). */
export type AuditData = {
  sha256: string;
  version: number;
  created_at: string;
  validated_by: string | null;
  validated_at: string | null;
  marker: string;
  timestamps: [string, string][];
  transcript: { role: string; at: string; text: string; text_de: string | null }[];
  weather: string | null;
  photos: string[];
};
