// Which transcribed segments reach Klara (SPEC §11 M3): empty segments, fillers
// and known silence hallucinations are dropped. Short answers stay: "Ja",
// "Nein", "zwei" are whole turns in a call.

const FILLER = /^(u+h+m*|ä+h+m*|ähm|e+h+m*|e+r+m*|h+m+|m+h+m+|a+h+|o+h+|э+|м+|ну)$/iu;
/** Phrases speech-to-text models produce on silence or noise. */
const HALLUCINATIONS = [
  /^(thank you|thanks for watching)[.!]?$/i,
  /^untertitel (der|im auftrag des) .+$/i,
  /^vielen dank( fürs zuschauen)?[.!]?$/i,
  /^продолжение следует/i,
  /^субтитры /i,
  /^napisy /i,
];

export function isNoise(text: string): boolean {
  const t = text.trim();
  if (!t || !/[\p{L}\p{N}]/u.test(t)) return true;
  if (HALLUCINATIONS.some((re) => re.test(t))) return true;
  const words = t.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
  if (!words.length) return true;
  if (words.length === 1) {
    const w = words[0];
    if (FILLER.test(w)) return true;
    if (w.length === 1 && !/\p{N}/u.test(w)) return true;
  }
  return false;
}
