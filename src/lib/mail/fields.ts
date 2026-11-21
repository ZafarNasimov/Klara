// Field checks for an e-mail draft, shared by the server (send) and the
// composer (live, while typing). Client-safe.
import type { EmailOut } from "@/lib/types";

export const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** The person the letter (PDF) is addressed to. */
export type Addressee = { email: string; name: string; organisation: string };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The letter's addressee must be among the e-mail's recipients: the e-mail
 * must not go somewhere the letter is not addressed to (e.g. only to the
 * architect without Vollmacht).
 */
export function addresseeProblem(to: string[], addressee: Addressee | null): string | null {
  if (!addressee || to.some((a) => same(a, addressee.email))) return null;
  return `Das Schreiben ist an ${addressee.name}, ${addressee.organisation} adressiert. Diese Adresse muss unter „An“ stehen.`;
}

/** What is wrong with the draft's own fields; null when they are complete. */
export function fieldBlocker(draft: Pick<EmailOut, "to" | "cc" | "subject" | "body">, addressee: Addressee | null = null): string | null {
  if (!draft.to.length) return "Bitte mindestens einen Empfänger angeben.";
  const bad = [...draft.to, ...draft.cc].find((a) => !EMAIL.test(a));
  if (bad) return `Ungültige E-Mail-Adresse: ${bad}`;
  const wrong = addresseeProblem(draft.to, addressee);
  if (wrong) return wrong;
  if (!draft.subject.trim()) return "Bitte einen Betreff angeben.";
  if (!draft.body.trim()) return "Bitte einen Text angeben.";
  return null;
}
