// Per-segment language and translation checks. Pure (unit-tested): the LLM
// call lives in translate.ts; everything that decides what is stored is here.
import { findFloors, germanFloors } from "./floors";
import type { Segment } from "./model";

/** What the translation model returns for one segment. */
export type TranslationOut = {
  language?: string | null;
  text_de?: string | null;
  /** 0–1: the transcription is coherent and the translation faithful. */
  confidence?: number | null;
  /** The speaker switched language inside the segment. */
  mixed?: boolean | null;
  /** German, short: why it is unsure. */
  issue?: string | null;
};

const ISO = /^[a-z]{2}$/;

/**
 * Best guess from the letters alone. Only a fallback when no model is
 * available; the translation model detects the language per segment.
 */
export function guessLanguage(text: string): string {
  const t = text.toLowerCase();
  if (/[Ѐ-ӿ]/.test(t)) {
    if (/[іїєґ]/.test(t)) return "uk";
    if (/[ђћџљњј]/.test(t)) return "sr";
    return "ru";
  }
  if (/[ąęłńśźż]/.test(t)) return "pl";
  if (/[ăâîșşțţ]/.test(t)) return "ro";
  if (/[ğış]/.test(t)) return "tr";
  if (/[ćčđ]/.test(t) || /\b(ne|da|smo|možemo|sprat|nije|jeste)\b/.test(t)) return "sr";
  if (/[äöüß]/.test(t) || /\b(der|die|das|und|ist|wir|nicht|bitte)\b/.test(t)) return "de";
  if (/\b(the|and|is|we|not|please|floor)\b/.test(t)) return "en";
  return "de";
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * One translated segment as stored. German stays verbatim. Floor numbers are
 * checked against the counting rules (floors.ts): a single wrong floor in the
 * translation is corrected and noted; several, or an ambiguous one, make the
 * segment "unsicher".
 */
export function finalizeSegment(src: Segment, out: TranslationOut | undefined, sttConfidence: number | null = null): Segment {
  const language = out?.language && ISO.test(out.language.toLowerCase()) ? out.language.toLowerCase() : guessLanguage(src.text_original);
  const notes: string[] = [];
  let confidence = Math.min(sttConfidence ?? 1, typeof out?.confidence === "number" ? Math.max(0, Math.min(1, out.confidence)) : 0.5);
  let text_de = language === "de" ? src.text_original : (out?.text_de ?? "").trim();

  if (!text_de) {
    text_de = src.text_original;
    confidence = Math.min(confidence, 0.3);
    notes.push("Nicht übersetzt");
  }

  if (language !== "de") {
    const floors = findFloors(src.text_original);
    for (const f of floors) if (f.note) notes.push(f.note);
    if (floors.some((f) => f.level === null)) confidence = Math.min(confidence, 0.5);
    const expected = floors.filter((f) => f.level !== null).map((f) => f.de);
    const got = germanFloors(text_de);
    const missing = expected.filter((e) => !got.includes(e));
    if (missing.length) {
      const wrong = got.filter((g) => !expected.includes(g));
      if (missing.length === 1 && expected.length === 1 && wrong.length === 1) {
        // One floor, translated with the wrong counting: correct it, say so.
        text_de = text_de.replace(new RegExp(wrong[0].replace(". ", "\\s*\\.\\s*").replace("OG", "(?:OG|Obergeschoss)")), missing[0]);
        notes.push(`Etagenangabe in der Übersetzung korrigiert: ${wrong[0]} → ${missing[0]}`);
      } else {
        confidence = Math.min(confidence, 0.5);
        notes.push(`Etagenangabe prüfen: gesagt ${floors.map((f) => `„${f.match}“`).join(", ")} = ${expected.join(", ")}`);
      }
    }
  }
  if (out?.mixed) notes.push("Sprachwechsel innerhalb des Abschnitts");
  if (confidence < 0.6 && out?.issue?.trim()) notes.push(`Unsicher: ${out.issue.trim()}`);

  return { ...src, language, text_de, confidence: round(confidence), notes: [...src.notes.filter((n) => !notes.includes(n)), ...notes] };
}

/**
 * Without a translation model (test mode, or the model is unreachable):
 * German segments stay as they are; anything else is kept in the original,
 * marked "unsicher" so it never fills a template.
 */
export function untranslated(src: Segment, sttConfidence: number | null = null): Segment {
  const language = guessLanguage(src.text_original);
  if (language === "de") return { ...src, language, text_de: src.text_original, confidence: round(sttConfidence ?? 1) };
  return finalizeSegment(src, { language, text_de: null, confidence: 0.3 }, sttConfidence);
}
