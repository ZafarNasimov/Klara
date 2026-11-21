// Pure meeting logic: quote checks, dates, and the rule-based extractor used
// without an LLM. No server imports (unit-tested in items.test.ts).
import { addCalendarDays, weekday } from "@/lib/deadlines";
import { isUncertain, segmentDe, TEMPLATE_KINDS, type ItemKind, type MeetingItem, type Segment } from "./model";
import type { RawItem } from "./sample";

/** Lower case, one kind of quote and dash, single spaces, no trailing punctuation. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[„“”"«»‚‘’']/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[\s.,;:!?]+$/g, "")
    .trim();
}

/** The segment whose German text contains `quote` verbatim (normalized), preferring the hinted one. */
export function findQuote(quote: string, segments: Segment[], hint?: number | null): number | null {
  const q = normalizeText(quote);
  if (q.length < 6) return null;
  if (hint !== undefined && hint !== null && segments[hint] && normalizeText(segmentDe(segments[hint])).includes(q)) return hint;
  const i = segments.findIndex((s) => normalizeText(segmentDe(s)).includes(q));
  return i >= 0 ? i : null;
}

const TEMPLATE = new Set<string>(TEMPLATE_KINDS);

const WEEKDAYS: Record<string, number> = { sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6 };

/**
 * A spoken day as YYYY-MM-DD, relative to the meeting day. Weekdays mean the
 * next such day after the meeting ("Freitag" said on a Friday = next week).
 * Returns null when the words are not a day we can be sure of.
 */
export function resolveDay(text: string | null | undefined, baseDay: string): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\bheute\b/.test(t)) return baseDay;
  if (/\bübermorgen\b/.test(t)) return addCalendarDays(baseDay, 2);
  if (/\bmorgen\b/.test(t)) return addCalendarDays(baseDay, 1);
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (iso) return iso[0];
  const de = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})?/.exec(t);
  if (de) {
    const y = de[3] ? Number(de[3]) : Number(baseDay.slice(0, 4));
    let day = `${y}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`;
    if (!de[3] && day < baseDay) day = `${y + 1}${day.slice(4)}`;
    return day;
  }
  for (const [name, wd] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}`).test(t)) {
      const diff = ((wd - weekday(baseDay) + 7) % 7) || 7;
      return addCalendarDays(baseDay, diff);
    }
  }
  return null;
}

/**
 * Raw extraction → stored items. An item without a verbatim quote from the
 * German transcript is discarded: nothing in a meeting result is invented.
 * Each item keeps the German quote and the words as said (quote_original:
 * the model's quote if it is verbatim in the original, else the whole
 * original segment). A template item whose only evidence is an "unsicher"
 * segment is marked `uncertain` and never fills a template.
 */
export function verifyItems(raw: RawItem[], segments: Segment[], ctx: { meetingId: string; baseDay: string; newId: () => string }): MeetingItem[] {
  const out: MeetingItem[] = [];
  for (const r of raw) {
    if (!r || typeof r.quote_de !== "string" || typeof r.text !== "string" || !r.text.trim()) continue;
    const seg = findQuote(r.quote_de, segments, r.segment);
    if (seg === null) continue;
    const s = segments[seg];
    const language = s.language ?? "de";
    const said = r.quote_original?.trim() ?? "";
    const quote_original =
      said.length >= 4 && normalizeText(s.text_original).includes(normalizeText(said)) ? said : language === "de" ? r.quote_de.trim() : s.text_original.trim();
    const supported = (r.support ?? []).some((j) => j !== seg && segments[j] && !isUncertain(segments[j]));
    const uncertain = TEMPLATE.has(r.kind) && isUncertain(s) && !supported;
    const d = typeof r.depends_on === "number" && r.depends_on !== seg ? segments[r.depends_on] : undefined;
    out.push({
      id: ctx.newId(),
      meeting_id: ctx.meetingId,
      kind: r.kind,
      trade: r.trade ?? null,
      team_id: null,
      area: normalizeArea(r.area ?? null),
      text: r.text.trim(),
      owner: r.owner ?? null,
      due_date: resolveDay(r.due ?? null, ctx.baseDay),
      quote_de: r.quote_de.trim(),
      quote_original,
      quote_language: language,
      ...(uncertain ? { uncertain: true } : {}),
      depends: d ? { text_de: segmentDe(d), text_original: d.text_original, language: d.language ?? "de", speaker: d.speaker, ts_sec: d.start_sec } : null,
      speaker: s.speaker,
      ts_sec: s.start_sec,
      new_date: resolveDay(r.new_end ?? null, ctx.baseDay),
      created_case_id: null,
      updated_case_id: null,
      case_ref: null,
      status: "offen",
    });
  }
  return out;
}

/** "2. OG", "2.og", "2. Obergeschoss" → "2.OG". */
export function normalizeArea(area: string | null): string | null {
  if (!area) return null;
  const m = /(\d+)\s*\.?\s*(og|obergeschoss)\b/i.exec(area);
  if (m) return `${m[1]}.OG`;
  if (/\b(eg|erdgeschoss)\b/i.test(area)) return "EG";
  const ug = /(\d*)\s*\.?\s*(ug|untergeschoss)\b/i.exec(area);
  if (ug) return `${ug[1] ? `${ug[1]}.` : ""}UG`;
  return area.trim();
}

// ── Rule-based extraction (no LLM: LLM_MODE=mock, or as a safety net) ───────

const TRADES = ["Elektro", "Estrich", "Trockenbau", "Bodenbelag", "Sanitär", "Heizung", "Lüftung", "Fassade", "Rohbau", "Maler", "Fliesen"];
const DAY_WORDS = "(heute|morgen|übermorgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|\\d{1,2}\\.\\d{1,2}\\.)";

const findTrade = (s: string) => TRADES.find((t) => s.toLowerCase().includes(t.toLowerCase())) ?? null;
const findArea = (s: string) => normalizeArea(/(\d+\s*\.\s*OG|\d+\s*\.?\s*Obergeschoss|\bEG\b|Erdgeschoss|\bUG\b)/i.exec(s)?.[0] ?? null);
const NEGATED = /\b(kein|keine|keinen|nicht)\b[^.]{0,20}\b(mangel|mängel|bedenken)/i;

/** One sentence = one candidate; the quote is always the sentence itself. */
export function ruleExtract(segments: Segment[]): RawItem[] {
  const items: RawItem[] = [];
  segments.forEach((seg, i) => {
    // Sentence ends: punctuation not after a digit ("2. OG" stays whole), before a capital.
    for (const sentence of segmentDe(seg).split(/(?<=[^\d][.!?])\s+(?=[A-ZÄÖÜ„])/)) {
      const s = sentence.trim();
      if (s.length < 8) continue;
      const lower = s.toLowerCase();
      const push = (kind: ItemKind, extra: Partial<RawItem> = {}) =>
        items.push({ kind, text: s.replace(/[.!?]+$/, ""), quote_de: s, segment: i, trade: findTrade(s), area: findArea(s), ...extra });
      const day = new RegExp(`\\b(erst|bis|am|ab)?\\s*${DAY_WORDS}`, "i").exec(s)?.[2] ?? null;

      if (/\berst\b/.test(lower) && day && /(schaffen|fertig|kommen|liefern)/.test(lower)) {
        push("behinderung", { new_end: day });
        push("termin", { new_end: day });
      } else if (/\b(verschiebt|verzögert|verzug|später)\b/.test(lower) && day) {
        push("termin", { new_end: day });
      }
      if (/\bbitte\b/.test(lower) && /\bzusätzlich/.test(lower)) {
        push("anordnung");
        push("mehrkosten");
      }
      if (/\b(wir halten fest|beschlossen|vereinbart|startet nach|wird festgelegt)\b/.test(lower)) push("decision");
      if (!NEGATED.test(s)) {
        if (/\b(mangel|mängel|riss|undicht|beschädigt|fehlerhaft)\b/.test(lower)) push("mangel");
        if (/\bbedenken\b/.test(lower)) push("bedenken");
      }
      if (day && /(\bkommt\b|\bschick|\bliefer|\borganisier|\bmachen wir am\b|\bstellen wir bis\b|\bbis (montag|dienstag|mittwoch|donnerstag|freitag)\b)/.test(lower) && !/\berst\b/.test(lower)) {
        push("task", { due: day, owner: seg.speaker });
      }
    }
  });
  return items;
}

/** Up to 5 short bullets from the rule result (LLM-free summary). */
export function ruleSummary(items: RawItem[]): string[] {
  const order: ItemKind[] = ["behinderung", "decision", "anordnung", "mangel", "bedenken", "task"];
  const out: string[] = [];
  for (const k of order) for (const i of items) if (i.kind === k && out.length < 5 && !out.includes(i.text)) out.push(i.text);
  return out;
}
