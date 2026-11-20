// Phrasing Klara's lines in the user's language (SPEC §6.2: second small LLM
// call; pre-written lines for en/de/ru avoid it).
import "server-only";
import { getDocType } from "@/lib/doctypes";
import { fmtDateTime, fmtDate } from "@/lib/labels";
import type { Case } from "@/lib/types";
import { callTool, fastModel, llmMode } from "./llm";
import { fill, LINES, type LineKey } from "./lines";
import { PHRASE_SYSTEM, PHRASE_TOOL } from "./prompt";

const LANG_NAMES: Record<string, string> = {
  de: "German", en: "English", ru: "Russian", pl: "Polish", tr: "Turkish", ro: "Romanian", uk: "Ukrainian", bg: "Bulgarian", hr: "Croatian", sr: "Serbian", cs: "Czech", hu: "Hungarian", ar: "Arabic", it: "Italian",
};

async function translate(english: string, lang: string, context?: string): Promise<string> {
  if (lang === "en" || llmMode() !== "live") return english;
  try {
    const out = await callTool<{ text: string }>({
      model: fastModel(),
      system: PHRASE_SYSTEM,
      user: `Language: ${LANG_NAMES[lang] ?? lang} (${lang}). Use the formal address where the language has one.${context ? `\nContext: ${context}` : ""}\nLine: ${english}`,
      tool: PHRASE_TOOL,
      maxTokens: 2000,
    });
    return out.text?.trim() || english;
  } catch (e) {
    console.warn("[phrase] translation failed, using English", e);
    return english;
  }
}

export async function line(key: LineKey, lang: string, vars: Record<string, string | number> = {}): Promise<string> {
  const l = LINES[key] as Record<string, string>;
  if (l[lang]) return fill(l[lang], vars);
  return translate(fill(l.en, vars), lang);
}

export async function question(docType: string, field: string, lang: string): Promise<string> {
  const def = getDocType(docType);
  const f = def?.fields.find((x) => x.key === field);
  if (!f) return line("clarify", lang);
  const pre = f.ask as Record<string, string> | undefined;
  if (pre?.[lang]) return pre[lang];
  return translate(pre?.en ?? f.question_hint, lang, `Klara asks a site worker about a ${def!.title_de}.`);
}

/** German "Label: value" lines for a case (values as they will appear in the letter). */
export function factLines(c: Case): string[] {
  const def = getDocType(c.doc_type);
  if (!def) return [];
  const keys = def.readback_fields ?? def.fields.map((f) => f.key);
  const out: string[] = [];
  for (const k of keys) {
    const f = def.fields.find((x) => x.key === k);
    const v = c.facts[k];
    if (!f) continue;
    if (v === undefined || v === null || v === "") {
      if (c.declined_fields.includes(k) && f.unknown_value_de) out.push(`${f.label_de}: ${f.unknown_value_de}`);
      continue;
    }
    out.push(`${f.label_de}: ${formatValue(f.type, v)}`);
  }
  return out;
}

export function formatValue(type: string, v: unknown): string {
  if (type === "datetime" && typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : `${fmtDateTime(d)} Uhr`;
  }
  if (type === "date" && typeof v === "string") {
    const d = new Date(`${v.slice(0, 10)}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? v : fmtDate(d);
  }
  if (type === "bool") return v ? "ja" : "nein";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

/** Readback of one or more cases, in the user's language. */
export async function readback(cases: Case[], lang: string): Promise<string> {
  const blocks = cases.map((c) => {
    const def = getDocType(c.doc_type)!;
    return `${def.title_de}: ${factLines(c).join("; ")}`;
  });
  const german = blocks.join(" | ");
  if (lang === "de" || llmMode() !== "live") {
    const [intro, outro] = await Promise.all([line("readbackIntro", lang), line("readbackOutro", lang)]);
    return `${intro} ${german}. ${outro}`;
  }
  return translate(
    `Let me read that back: ${german}. Is that correct?`,
    lang,
    "Summarize the facts briefly for the worker in their language (keep numbers, times and floor names exact). End by asking if it is correct. Up to 45 words.",
  );
}
