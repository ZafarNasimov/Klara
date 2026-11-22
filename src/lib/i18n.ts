// UI language (DE default, EN for an English-speaking audience). German texts are
// the keys; `src/lib/i18n-en.ts` holds the English. Letters, PDFs and what people
// said stay German (they are the legal content). Client-safe and pure: the
// language is set by <LangProvider>, which re-mounts the screens on a switch.
import { EN, EN_PATTERNS } from "./i18n-en";

export type Lang = "de" | "en";

let current: Lang = "de";

/** Called by <LangProvider> only (on the server it stays German). */
export function setCurrentLang(lang: Lang) {
  current = lang;
}

export function currentLang(): Lang {
  return current;
}

const fill = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;

/** A fixed German UI text in the current language; `{name}` placeholders are filled from `vars`. */
export function $t(de: string, vars?: Record<string, string | number>): string {
  return fill(current === "en" ? (EN[de] ?? de) : de, vars);
}

/**
 * German text built on the server (check reasons, deadline labels, timeline
 * lines, Klara's hints): the exact entry, else the first matching pattern, else as is.
 */
export function $tx(de: string | null | undefined): string {
  if (!de) return de ?? "";
  if (current !== "en") return de;
  const exact = EN[de];
  if (exact) return exact;
  for (const [re, to] of EN_PATTERNS) {
    const m = re.exec(de);
    if (m) return to(m);
  }
  // "Elektro · Riem · +1 Tag": each part on its own.
  if (de.includes(" · ")) return de.split(" · ").map((part) => $tx(part)).join(" · ");
  return de;
}
