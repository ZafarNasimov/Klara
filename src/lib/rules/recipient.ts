// Who receives the letter (SPEC §7 "Recipient" check). Deterministic.
// Letters to the client go to the contact with authority to represent it. If
// the usual site contact (the architect) has no such authority, the addressee
// is replaced automatically and the light turns amber to show the correction.
import type { RecipientKind } from "@/lib/doctypes/types";
import type { CheckResult, Contact } from "@/lib/types";
import type { RulesCtx } from "./context";

export type RecipientResult = { to: Contact | null; cc: Contact[]; check: CheckResult };

export const CONTACT_ROLE_DE: Record<Contact["role"], string> = {
  bauherr: "Bauherr",
  architekt: "Architekt",
  nu: "Nachunternehmer",
  intern: "intern",
};

const ROLE_WORDS: { role: Contact["role"]; re: RegExp }[] = [
  { role: "architekt", re: /architekt|architect|архитект|mimar|arhitect/i },
  { role: "bauherr", re: /bauherr|auftraggeber|client|owner|заказчик|inwestor|zamawiaj|işveren|beneficiar/i },
];

/** Find the project contact meant by free text like "Thomas Weber (Architekt)" or "Architekt Weber". */
export function matchContact(text: string | null | undefined, contacts: Contact[]): Contact | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const byName = contacts.find((c) => {
    const parts = c.name.toLowerCase().replace(/^(dr\.|prof\.)\s*/g, "").split(/\s+/);
    const last = parts[parts.length - 1];
    return last.length > 2 && t.includes(last);
  });
  if (byName) return byName;
  for (const { role, re } of ROLE_WORDS) {
    if (re.test(t)) return contacts.find((c) => c.role === role) ?? null;
  }
  return null;
}

export function resolveRecipient(
  kind: RecipientKind,
  ctx: RulesCtx,
  opts: { instructedBy?: string | null; subcontractorContactId?: string | null } = {},
): RecipientResult {
  const id = "recipient";
  const label_de = "Adressat";

  if (kind === "internal") {
    return { to: null, cc: [], check: { id, label_de, light: "green", reason_de: "Interner Bericht, kein Versand nach außen" } };
  }

  if (kind === "subcontractor") {
    const to = ctx.contacts.find((c) => c.id === opts.subcontractorContactId) ?? null;
    return to
      ? { to, cc: [], check: { id, label_de, light: "green", reason_de: `${to.organisation}, ${to.name}` } }
      : { to: null, cc: [], check: { id, label_de, light: "red", reason_de: "Kein Ansprechpartner des Nachunternehmers hinterlegt" } };
  }

  // Client: the contact with authority (Vollmacht) to represent the client.
  const authority =
    ctx.contacts.find((c) => c.role === "bauherr" && c.has_authority) ?? ctx.contacts.find((c) => c.has_authority && c.role !== "nu");
  if (!authority) {
    return {
      to: null,
      cc: [],
      check: { id, label_de, light: "red", reason_de: "Kein vertretungsberechtigter Ansprechpartner des Auftraggebers hinterlegt" },
    };
  }

  const instructing = matchContact(opts.instructedBy, ctx.contacts);
  const cc = instructing && instructing.id !== authority.id && instructing.role !== "nu" ? [instructing] : [];

  // The person who gave the instruction, or else the client's site contact, lacks authority.
  const replaced =
    instructing && !instructing.has_authority && instructing.id !== authority.id
      ? instructing
      : ctx.contacts.find((c) => c.role === "architekt" && !c.has_authority) ?? null;

  if (replaced) {
    return {
      to: authority,
      cc,
      check: {
        id,
        label_de,
        light: "yellow",
        reason_de: `Adressat: ${CONTACT_ROLE_DE[authority.role]} (${CONTACT_ROLE_DE[replaced.role]} ohne Vollmacht)`,
      },
    };
  }
  return {
    to: authority,
    cc,
    check: { id, label_de, light: "green", reason_de: `${authority.name}, ${authority.organisation} (vertretungsberechtigt)` },
  };
}
