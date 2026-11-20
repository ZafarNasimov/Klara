// Klara's lines in the user's language (SPEC §6.2 "second small LLM call").
// en/de/ru (and the fixed lines for pl/tr/ro) are pre-written, so most turns
// need no extra call. Other cases go to the fast model; on any failure Klara
// falls back to the pre-written English or the German template.
import "server-only";
import { berlinDay } from "@/lib/deadlines";
import { getDocType, hasValue, type FieldDef } from "@/lib/doctypes";
import { fmtDate, fmtNumber, fmtTime } from "@/lib/labels";
import type { Case, ConfirmView } from "@/lib/types";
import { callTool, fastModel, llmMode } from "./llm";
import { DOC_SPOKEN, fill, LINES, READBACK_LABELS, WORDS, type LineKey } from "./lines";
import { PHRASE_SYSTEM, SAY_TOOL } from "./prompt";

const LANGUAGE_EN: Record<string, string> = {
  en: "English",
  de: "German",
  ru: "Russian",
  pl: "Polish",
  tr: "Turkish",
  ro: "Romanian",
  uk: "Ukrainian",
  hr: "Croatian",
  sr: "Serbian",
  bg: "Bulgarian",
  hu: "Hungarian",
  cs: "Czech",
  it: "Italian",
  es: "Spanish",
  pt: "Portuguese",
  ar: "Arabic",
};

const PHRASE_TIMEOUT_MS = 4000;

async function phraseWithLlm(text: string, lang: string, note: string): Promise<string | null> {
  if (llmMode() !== "live") return null;
  const language = LANGUAGE_EN[lang] ?? lang;
  const call = callTool<{ text: string }>({
    model: fastModel(),
    system: PHRASE_SYSTEM,
    user: `Target language: ${language}\n${note}\nMessage:\n${text}`,
    tool: SAY_TOOL,
    maxTokens: 1500,
    effort: "low",
  }).then((r) => (typeof r.input.text === "string" && r.input.text.trim() ? r.input.text.trim() : null));
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), PHRASE_TIMEOUT_MS));
  try {
    return await Promise.race([call, timeout]);
  } catch (err) {
    console.warn("[klara] phrasing failed, using fallback", err);
    return null;
  }
}

/** A fixed line in the user's language. */
export async function line(key: LineKey, lang: string, vars: Record<string, string | number> = {}): Promise<string> {
  const table = LINES[lang];
  if (table) return fill(table[key], vars);
  const en = fill(LINES.en[key], vars);
  return (await phraseWithLlm(en, lang, "Translate this line.")) ?? en;
}

/** A note from the office (German) in the user's language; German when no model is available. */
export async function translateNote(note_de: string, lang: string): Promise<string> {
  if (lang === "de") return note_de;
  return (await phraseWithLlm(note_de, lang, "Translate this note from the site manager.")) ?? note_de;
}

/** The question for one field, in the user's language. */
export async function question(docType: string, field: string, lang: string): Promise<string> {
  const f = getDocType(docType)?.fields.find((x) => x.key === field);
  if (!f) return line("clarify", lang);
  const pre = f.ask?.[lang as keyof NonNullable<FieldDef["ask"]>];
  if (pre) return pre;
  if (lang === "de") return `Bitte noch angeben: ${f.label_de}.`;
  const en = f.ask?.en ?? f.question_hint;
  return (await phraseWithLlm(en, lang, "Ask this question.")) ?? en;
}

/** Human value of a fact for the readback, in the user's language where possible. */
export function formatValue(f: FieldDef, v: unknown, lang: string, now: Date): string {
  const w = WORDS[lang] ?? WORDS.en;
  if (f.type === "bool") return v === true ? w.yes : v === false ? w.no : String(v);
  if (f.type === "number") {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isNaN(n)) return String(v);
    if (f.key === "estimate_eur") return `${fmtNumber(n)} €`;
    if (f.key === "idle_staff") return `${fmtNumber(n)} ${w.people}`;
    return fmtNumber(n, 2);
  }
  if ((f.type === "datetime" || f.type === "date") && typeof v === "string") {
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(v);
    const d = new Date(isDate ? `${v}T12:00:00Z` : v);
    if (Number.isNaN(d.getTime())) return v;
    const day = berlinDay(d);
    const today = berlinDay(now);
    const yesterday = berlinDay(new Date(now.getTime() - 86400000));
    const dayWord = day === today ? w.today : day === yesterday ? w.yesterday : fmtDate(day);
    return isDate ? dayWord : `${dayWord} ${fmtTime(d)}`;
  }
  // Values are read inside a sentence; their own final period would double up.
  return (Array.isArray(v) ? v.join(", ") : String(v)).replace(/[.\s]+$/, "");
}

function readbackTemplate(cases: Case[], lang: string, now: Date): string {
  const labels = READBACK_LABELS[lang] ?? READBACK_LABELS.en;
  const titles = DOC_SPOKEN[lang] ?? DOC_SPOKEN.en;
  const table = LINES[lang] ?? LINES.en;
  const parts = cases.map((c) => {
    const def = getDocType(c.doc_type)!;
    const facts = def.readback_fields
      .map((k) => def.fields.find((f) => f.key === k)!)
      .filter((f) => f && hasValue(c.facts[f.key]))
      .map((f) => `${labels[f.key] ?? f.label_de}: ${formatValue(f, c.facts[f.key], lang, now)}`);
    return `${titles[c.doc_type] ?? def.title_de}: ${facts.join("; ")}.`;
  });
  return [table.readbackIntro, ...parts, table.readbackOutro].join(" ");
}

/** The readback as rows for the confirm card: label and value in the user's language, German value alongside. */
export function readbackView(cases: Case[], lang: string, now: Date, intro: ConfirmView["intro"] = "readback"): ConfirmView {
  const labels = READBACK_LABELS[lang] ?? READBACK_LABELS.en;
  const titles = DOC_SPOKEN[lang] ?? DOC_SPOKEN.en;
  return {
    language: lang,
    intro,
    docs: cases.map((c) => {
      const def = getDocType(c.doc_type)!;
      const title = lang === "de" ? null : (titles[c.doc_type] ?? null);
      return {
        case_id: c.id,
        doc_type: c.doc_type,
        title_de: def.title_de,
        title: title && title !== def.title_de ? title : null,
        rows: def.readback_fields
          .map((k) => def.fields.find((f) => f.key === k))
          .filter((f): f is FieldDef => !!f && hasValue(c.facts[f.key]))
          .map((f) => ({
            key: f.key,
            label: labels[f.key] ?? f.label_de,
            value: formatValue(f, c.facts[f.key], lang, now),
            value_de: formatValue(f, c.facts[f.key], "de", now),
            mono: f.type === "number" || f.type === "date" || f.type === "datetime",
          })),
      };
    }),
  };
}

/** Readback of all cases waiting for confirmation. Returns the line and its German version. */
export async function readback(cases: Case[], lang: string, now: Date): Promise<{ text: string; text_de: string }> {
  const text_de = readbackTemplate(cases, "de", now);
  if (lang === "de") return { text: text_de, text_de };
  const template = readbackTemplate(cases, lang, now);
  // German fact values read badly in another language; let the fast model phrase it.
  const phrased = await phraseWithLlm(
    template,
    lang,
    "Read these facts back to the caller in a natural way and end by asking if they are correct. Translate German values. Keep every fact, add none. Max 45 words.",
  );
  return { text: phrased ?? template, text_de };
}
