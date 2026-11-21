// Floor numbers across languages → German "N. OG" / "EG". Legally relevant:
// a Behinderung in the wrong floor is a wrong letter. Pure, unit-tested.
//
// Russian and Ukrainian count the ground floor as floor 1, so "3-й этаж" is
// the 2. OG. German, Polish, Serbian/Croatian/Bosnian, Turkish, Romanian and
// British English count like German. US English "first floor" is the ground
// floor, so an English "first floor" stays ambiguous and must be confirmed.

export type FloorRef = {
  /** The words as said, e.g. "Третий этаж". */
  match: string;
  /** Language family of the counting rule (from the noun, not the detector). */
  lang: "ru" | "uk" | "pl" | "sr" | "tr" | "ro" | "en";
  /** Floors above ground in German counting (0 = EG); null = ambiguous. */
  level: number | null;
  /** "2. OG", "EG", or "EG/1. OG?" when ambiguous. */
  de: string;
  /** The number changed (RU/UK counting). */
  converted: boolean;
  /** For the transcript: what was converted or what needs confirming. */
  note: string | null;
};

const deFloor = (level: number) => (level <= 0 ? "EG" : `${level}. OG`);

// Ordinal stems 1–10 per language (case endings follow as letters).
const RU = ["перв", "втор", "трет", "четв[её]рт", "пят", "шест", "седьм", "восьм", "девят", "десят"];
const UK = ["перш", "друг", "трет", "четверт", "п['ʼ’]?ят", "шост", "сьом", "восьм", "дев['ʼ’]?ят", "десят"];
const PL = ["pierwsz", "drug", "trzec", "czwart", "piąt", "szóst", "siódm", "ósm", "dziewiąt", "dziesiąt"];
const SR = ["prv", "drug", "tre[ćc]", "[čc]etvrt", "pet", "[šs]est", "sedm", "osm", "devet", "deset"];
const SR_CYR = ["прв", "друг", "трећ", "четврт", "пет", "шест", "седм", "осм", "девет", "десет"];
const TR = ["birinci", "ikinci", "üçüncü", "dördüncü", "beşinci", "altıncı", "yedinci", "sekizinci", "dokuzuncu", "onuncu"];
const RO = ["(?:întâi|intai|unu)", "doi", "trei", "patru", "cinci", "șase|sase", "șapte|sapte", "opt", "nouă|noua", "zece"];
/** "etajul al doilea" = 2nd … (no "al" form for the first). */
const RO_AL = ["doilea", "treilea", "patrulea", "cincilea", "șaselea|saselea", "șaptelea|saptelea", "optulea", "nouălea|noualea", "zecelea"];
const EN = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

const L = "\\p{L}*";
/** Word edges that also work for Cyrillic and diacritics (\\b is ASCII-only). */
const B = "(?<!\\p{L})";
const E = "(?!\\p{L})";
const ord = (stems: string[]) => `${B}(${stems.map((x) => `(?:${x})`).join("|")})${L}`;
const stemIndex = (stems: string[], word: string) => stems.findIndex((x) => new RegExp(`^(?:${x})`, "iu").test(word)) + 1;

type Rule = { lang: FloorRef["lang"]; re: RegExp; count: (m: RegExpExecArray) => number | "ground" | null };

const RULES: Rule[] = [
  // Russian: "третий этаж", "на 3-м этаже", "3 этаж", "этаж 3"
  { lang: "ru", re: new RegExp(`${ord(RU)}\\s+этаж${L}`, "giu"), count: (m) => stemIndex(RU, m[1]) },
  { lang: "ru", re: /(?<!\d)(\d{1,2})\s*-?\s*(?:[йм]|го|ом|ый|ой)?\s+этаж\p{L}*/giu, count: (m) => Number(m[1]) },
  { lang: "ru", re: /этаж\p{L}*\s+(?:№\s*)?(\d{1,2})\b/giu, count: (m) => Number(m[1]) },
  // Ukrainian: "третій поверх", "на 3-му поверсі"
  { lang: "uk", re: new RegExp(`${ord(UK)}\\s+повер${L}`, "giu"), count: (m) => stemIndex(UK, m[1]) },
  { lang: "uk", re: /(\d{1,2})\s*-?\s*(?:[йм]|го|му|ий)?\s+повер\p{L}*/giu, count: (m) => Number(m[1]) },
  // Polish: "drugie piętro", "na drugim piętrze", "2. piętro", "parter"
  { lang: "pl", re: new RegExp(`${ord(PL)}\\s+pi[ęe]t${L}`, "giu"), count: (m) => stemIndex(PL, m[1]) },
  { lang: "pl", re: /(\d{1,2})\.?\s+pi[ęe]t\p{L}*/giu, count: (m) => Number(m[1]) },
  { lang: "pl", re: /pi[ęe]tr\p{L}*\s+(\d{1,2})\b/giu, count: (m) => Number(m[1]) },
  // Serbian / Croatian / Bosnian: "treći sprat", "na trećem spratu", "3. kat", "prizemlje"
  { lang: "sr", re: new RegExp(`${ord(SR)}\\s+(?:sprat|kat)${L}`, "giu"), count: (m) => stemIndex(SR, m[1]) },
  { lang: "sr", re: new RegExp(`${ord(SR_CYR)}\\s+спрат${L}`, "giu"), count: (m) => stemIndex(SR_CYR, m[1]) },
  { lang: "sr", re: /(\d{1,2})\.\s*(?:sprat|спрат)\p{L}*/giu, count: (m) => Number(m[1]) },
  { lang: "sr", re: new RegExp(`${B}(?:prizemlj|приземљ)${L}`, "giu"), count: () => "ground" },
  // Turkish: "üçüncü kat(ta)", "3. kat", "zemin kat"
  { lang: "tr", re: new RegExp(`${ord(TR)}\\s+kat${L}`, "giu"), count: (m) => stemIndex(TR, m[1]) },
  { lang: "tr", re: /zemin\s+kat\p{L}*/giu, count: () => "ground" },
  { lang: "tr", re: /(\d{1,2})\.\s*kat\p{L}*/giu, count: (m) => Number(m[1]) },
  // Romanian: "etajul 3", "etajul doi", "etajul al treilea", "parter"
  { lang: "ro", re: new RegExp(`${B}etajul\\s+al\\s+(${RO_AL.join("|")})${E}`, "giu"), count: (m) => RO_AL.findIndex((x) => new RegExp(`^(?:${x})$`, "iu").test(m[1])) + 2 },
  { lang: "ro", re: new RegExp(`${B}etajul\\s+(${RO.join("|")})${E}`, "giu"), count: (m) => stemIndex(RO, m[1]) },
  { lang: "ro", re: /etaj(?:ul)?\s+(\d{1,2})\b/giu, count: (m) => Number(m[1]) },
  { lang: "ro", re: /primul\s+etaj/giu, count: () => 1 },
  // Ground floor words shared by Polish and Romanian.
  { lang: "pl", re: new RegExp(`${B}parter${L}`, "giu"), count: () => "ground" },
  // English: "ground floor", "third floor", "3rd floor"
  { lang: "en", re: /\bground\s+floor\b/giu, count: () => "ground" },
  { lang: "en", re: new RegExp(`\\b(${EN.join("|")})\\s+floor\\b`, "giu"), count: (m) => EN.indexOf(m[1].toLowerCase()) + 1 },
  { lang: "en", re: /\b(\d{1,2})(?:st|nd|rd|th)\s+floor\b/giu, count: (m) => Number(m[1]) },
];

const LANG_CODE: Record<FloorRef["lang"], string> = { ru: "RU", uk: "UK", pl: "PL", sr: "SR", tr: "TR", ro: "RO", en: "EN" };

/** Every floor reference in a (non-German) text, with its German floor. */
export function findFloors(text: string): FloorRef[] {
  const out: { at: number; ref: FloorRef }[] = [];
  const taken: [number, number][] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    for (let m = rule.re.exec(text); m; m = rule.re.exec(text)) {
      const start = m.index;
      const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      const n = rule.count(m);
      if (n === null || (typeof n === "number" && (!Number.isFinite(n) || n < 1 || n > 60))) continue;
      taken.push([start, end]);
      out.push({ at: start, ref: toRef(rule.lang, m[0].trim(), n) });
    }
  }
  return out.sort((a, b) => a.at - b.at).map((x) => x.ref);
}

function toRef(lang: FloorRef["lang"], match: string, n: number | "ground"): FloorRef {
  const code = LANG_CODE[lang];
  if (n === "ground") return { match, lang, level: 0, de: "EG", converted: false, note: null };
  if (lang === "ru" || lang === "uk") {
    const level = n - 1;
    return { match, lang, level, de: deFloor(level), converted: true, note: `Etagenangabe umgerechnet: ${code} „${match}“ → ${deFloor(level)}` };
  }
  if (lang === "en") {
    if (n === 1) return { match, lang, level: null, de: "EG/1. OG?", converted: false, note: `Etagenangabe mehrdeutig: EN „${match}“ (britisch 1. OG, amerikanisch EG), bitte bestätigen` };
    return { match, lang, level: n, de: deFloor(n), converted: false, note: `Etagenangabe EN „${match}“ → ${deFloor(n)} (britische Zählung; amerikanisch wäre es das ${deFloor(n - 1)}), bitte bestätigen` };
  }
  return { match, lang, level: n, de: deFloor(n), converted: false, note: null };
}

/** German floors mentioned in a German text: "2. OG", "2.OG", "2. Obergeschoss", "EG", "Erdgeschoss". */
export function germanFloors(text: string): string[] {
  const out: string[] = [];
  const re = /(\d{1,2})\s*\.\s*(?:OG|Obergeschoss)\b|\b(EG|Erdgeschoss)\b/gu;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(m[1] ? `${m[1]}. OG` : "EG");
  return out;
}
