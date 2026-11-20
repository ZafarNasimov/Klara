// Who receives the letter (SPEC §7 "Recipient" check). Deterministic.
import type { CheckResult, Contact } from "@/lib/types";
import type { RecipientKind } from "@/lib/doctypes/types";
import type { RulesCtx } from "./context";

export type RecipientResult = {
  to: Contact | null;
  cc: Contact[];
  check: CheckResult;
};

const ROLE_DE: Record<Contact["role"], string> = {
  bauherr: "Bauherr",
  architekt: "Architekt",
  nu: "Nachunternehmer",
  intern: "intern",
};

/** Find a project contact named in free text like "Thomas Weber (Architekt)" or "Architekt Weber". */
export function matchContact(text: string | null | undefined, contacts: Contact[]): Contact | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const byName = contacts.find((c) => {
    const parts = c.name.toLowerCase().replace(/^(dr\.|prof\.)\s*/g, "").split(/\s+/);
    const last = parts[parts.length - 1];
    return last.length > 2 && t.includes(last);
  });
  if (byName) return byName;
  if (/architekt|architect|архитект|architekt|mimar/.test(t)) {
    return contacts.find((c) => c.role === "architekt") ?? null;
  }
  if (/bauherr|client|заказчик|inwestor|işveren/.test(t)) {
    return contacts.find((c) => c.role === "bauherr") ?? null;
  }
  return null;
}

export function resolveRecipient(
  kind: RecipientKind,
  ctx: RulesCtx,
  opts: { instructedBy?: string | null; subcontractorContactId?: string | null } = {},
): RecipientResult {
  const label = "Adressat";
  if (kind === "internal") {
    return {
      to: null,
      cc: [],
      check: { id: "recipient", label_de: label, light: "green", reason_de: "Interner Bericht, kein externer Versand" },
    };
  }

  if (kind === "subcontractor") {
    const to = ctx.contacts.find((c) => c.id === opts.subcontractorContactId) ?? null;
    return to
      ? {
          to,
          cc: [],
          check: { id: "recipient", label_de: label, light: "green", reason_de: `${to.organisation}, ${to.name}` },
        }
      : {
          to: null,
          cc: [],
          check: { id: "recipient", label_de: label, light: "red", reason_de: "Kein Ansprechpartner des Nachunternehmers hinterlegt" },
        };
  }

  // client_with_authority
  const authority = ctx.contacts.find((c) => c.role === "bauherr" && c.has_authority)
    ?? ctx.contacts.find((c) => c.has_authority && c.role !== "nu");
  if (!authority) {
    return {
      to: null,
      cc: [],
      check: { id: "recipient", label_de: label, light: "red", reason_de: "Kein vertretungsberechtigter Ansprechpartner des Auftraggebers hinterlegt" },
    };
  }

  const instructing = matchContact(opts.instructedBy, ctx.contacts);
  const cc = instructing && instructing.id !== authority.id ? [instructing] : [];

  // The usual site contact (architect) has no authority: letters go to the client instead.
  const nonAuthority = instructing && !instructing.has_authority
    ? instructing
    : ctx.contacts.find((c) => c.role === "architekt" && !c.has_authority);
  if (nonAuthority) {
    return {
      to: authority,
      cc,
      check: {
        id: "recipient",
        label_de: label,
        light: "yellow",
        reason_de: `Adressat: ${ROLE_DE[authority.role]} (${ROLE_DE[nonAuthority.role]} ohne Vollmacht)`,
      },
    };
  }
  return {
    to: authority,
    cc,
    check: {
      id: "recipient",
      label_de: label,
      light: "green",
      reason_de: `${authority.name}, ${authority.organisation} (vertretungsberechtigt)`,
    },
  };
}
