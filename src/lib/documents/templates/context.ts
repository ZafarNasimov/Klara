import type { AppUser, Case, Company, Contact, Project } from "@/lib/types";
import type { DocBody, Party } from "../model";
import { dDate } from "../format";

export type TemplateCtx = {
  project: Project;
  company: Company;
  c: Case;
  facts: Record<string, unknown>;
  addressee: Contact | null;
  cc: Contact[];
  signatory: AppUser | null;
  now: Date;
  /** Related cases, e.g. the parent Behinderungsanzeige or a linked Mehrkostenanzeige. */
  parent?: Case | null;
  linkedMehrkosten?: Case | null;
};

export const party = (c: Contact | null): Party | null =>
  c ? { name: c.name, organisation: c.organisation, address: c.address ?? null } : null;

/** Header lines shared by all letters. */
export function subjectLines(ctx: TemplateCtx): string[] {
  return [
    `Bauvorhaben: ${ctx.project.name}, ${ctx.project.address}`,
    `Vertrag Nr. ${ctx.project.contract_no} vom ${dDate(ctx.project.contract_date)}`,
    `Unser Zeichen: ${ctx.c.reference}`,
  ];
}

export function letter(ctx: TemplateCtx, partial: Pick<DocBody, "title" | "blocks"> & Partial<DocBody>): DocBody {
  return {
    doc_type: ctx.c.doc_type,
    subject_lines: subjectLines(ctx),
    sender: { company: ctx.company.name, address: ctx.company.address },
    addressee: party(ctx.addressee),
    cc: ctx.cc.map((x) => party(x)!),
    place_date: `München, ${dDate(ctx.now.toISOString())}`,
    salutation: "Sehr geehrte Damen und Herren,",
    closing: "Mit freundlichen Grüßen",
    signatory: { name: ctx.signatory?.name ?? "Bauleitung", role: `Bauleitung, ${ctx.company.name}` },
    reference: ctx.c.reference,
    ...partial,
  };
}
