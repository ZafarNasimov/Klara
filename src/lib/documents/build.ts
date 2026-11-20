// Builds the structured letter for a case from its facts and project data, and
// its canonical Markdown (what the sha256 covers). Pure: no I/O.
import { addWerktage, DEFAULT_HOLIDAY_REGION } from "@/lib/deadlines";
import { requireDocType } from "@/lib/doctypes";
import { resolveRecipient, type RulesCtx } from "@/lib/rules";
import type { AppUser, Case, Company, Contact } from "@/lib/types";
import { dateDe } from "./templates/kit";
import { TEMPLATES } from "./templates";
import type { DocBlock, DocBody, DocParty } from "./types";

export type BuildCtx = RulesCtx & { company: Company; users: AppUser[] };

export type BuildInput = {
  c: Case;
  /** Letter date YYYY-MM-DD (Berlin). */
  letterDate: string;
  related?: { mehrkosten?: Case | null; parent?: Case | null };
};

const party = (c: Contact): DocParty => ({ name: c.name, organisation: c.organisation, address: c.address });

/** "Landsberger Straße 302, 80687 München" → "München". */
export function cityOf(address: string): string {
  return address.match(/\d{5}\s+(.+)$/)?.[1]?.trim() ?? address;
}

export function hasTemplate(docType: string): boolean {
  return docType in TEMPLATES;
}

export function buildBody(input: BuildInput, ctx: BuildCtx): DocBody {
  const { c, letterDate } = input;
  const def = requireDocType(c.doc_type);
  const template = TEMPLATES[def.id];
  if (!template) throw new Error(`Keine Vorlage für ${def.title_de}`);
  const region = typeof ctx.project.settings.holiday_region === "string" ? ctx.project.settings.holiday_region : DEFAULT_HOLIDAY_REGION;

  const tctx = {
    c,
    def,
    project: ctx.project,
    letterDate,
    replyBy: addWerktage(letterDate, 3, region),
    mehrkosten: input.related?.mehrkosten ?? null,
    parent: input.related?.parent ?? null,
    missing: [] as string[],
  };
  const out = template(tctx);

  const recipient = resolveRecipient(def.recipient, ctx, {
    instructedBy: typeof c.facts.instructed_by === "string" ? c.facts.instructed_by : null,
    subcontractorContactId: typeof c.facts._contact_id === "string" ? c.facts._contact_id : null,
  });
  const signer = ctx.users.find((u) => u.role === "bauleiter");

  return {
    doc_type: def.id,
    subject: out.subject,
    reference: c.reference,
    date: letterDate,
    place: cityOf(ctx.company.address),
    sender: { name: ctx.company.name, address: ctx.company.address },
    addressee: recipient.to ? party(recipient.to) : null,
    cc: recipient.cc.map(party),
    refs: [
      { label: "Bauvorhaben", value: `${ctx.project.name}, ${ctx.project.address}` },
      { label: "Vertrag", value: `Nr. ${ctx.project.contract_no} vom ${dateDe(ctx.project.contract_date)}` },
      { label: "Unser Zeichen", value: c.reference },
      ...(out.refs ?? []),
    ],
    salutation: "Sehr geehrte Damen und Herren,",
    blocks: out.blocks,
    closing: "Mit freundlichen Grüßen",
    signatory: { name: signer?.name ?? "Bauleitung", role: "Bauleitung", company: ctx.company.name },
    missing: [...new Set(tctx.missing)],
  };
}

function blockMd(b: DocBlock): string {
  switch (b.kind) {
    case "p":
      return b.text;
    case "quote":
      return `> ${b.text}`;
    case "bullets":
      return b.items.map((i) => `- ${i}`).join("\n");
    case "facts":
      return b.rows.map((r) => `**${r.label}:** ${r.value}`).join("  \n");
  }
}

/** Canonical Markdown of a letter. The sha256 of this text identifies the version. */
export function toMarkdown(b: DocBody): string {
  const lines: string[] = [];
  lines.push(`${b.sender.name}, ${b.sender.address}`, "");
  if (b.addressee) {
    lines.push(...[b.addressee.organisation, b.addressee.name, b.addressee.address].filter((x): x is string => !!x).map((x) => `${x}  `));
    lines.push("");
  }
  if (b.cc.length) lines.push(`Nachrichtlich: ${b.cc.map((p) => [p.name, p.organisation].filter(Boolean).join(", ")).join("; ")}`, "");
  lines.push(`${b.place}, ${dateDe(b.date)}`, "");
  lines.push(`## ${b.subject}`, "");
  lines.push(b.refs.map((r) => `${r.label}: ${r.value}`).join("  \n"), "");
  lines.push(b.salutation, "");
  for (const block of b.blocks) lines.push(blockMd(block), "");
  lines.push(b.closing, "", b.signatory.name + "  ", `${b.signatory.role}, ${b.signatory.company}`);
  return lines.join("\n").trim() + "\n";
}
