// Site password (SITE_PASSWORD): one shared password in front of the whole
// app, so a public deployment cannot be used to spend the API keys or send
// e-mails. Empty = no login (local development, tests). Used by src/proxy.ts
// (Node runtime) and the login route.
import { createHmac, timingSafeEqual } from "node:crypto";

export const ACCESS_COOKIE = "klara_access";

export function sitePassword(): string | null {
  return process.env.SITE_PASSWORD?.trim() || null;
}

/** The cookie value for a password: a keyed hash, so the password itself never sits in the browser. */
export function accessToken(password: string): string {
  return createHmac("sha256", password).update("klara-access-v1").digest("hex");
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** True when no password is set, or the cookie belongs to the current password. */
export function hasAccess(cookie: string | undefined): boolean {
  const pw = sitePassword();
  if (!pw) return true;
  return !!cookie && same(cookie, accessToken(pw));
}

export function passwordMatches(given: string): boolean {
  const pw = sitePassword();
  return !pw || same(accessToken(given.trim()), accessToken(pw));
}

/** Only same-site paths after login ("/admin", not "//evil.example"). */
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
