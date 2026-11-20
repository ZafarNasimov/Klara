// Keyword extractor used when no LLM is configured (LLM_MODE=mock) and as a
// fallback if the live call fails. It covers the demo and the SPEC §10
// scenarios in DE/EN/RU/PL/TR/RO; it is not meant to be clever.
import { berlinDay, berlinTime, addCalendarDays, weekday } from "@/lib/deadlines";
import { getDocType } from "@/lib/doctypes";
import { canonicalTradeName, resolveTrade } from "@/lib/rules/sphere";
import type { ExtractContext, ExtractedEvent, Extraction, ProgressReport } from "./types";

const has = (re: RegExp, s: string) => re.test(s);

export function guessLanguage(text: string): string {
  const t = text.toLowerCase();
  if (/[а-яё]/i.test(t)) return /[їєі]/.test(t) ? "uk" : "ru";
  if (/[ăâîșşțţ]/.test(t) && !/[äöüß]/.test(t)) return "ro";
  if (/[ğış]/.test(t)) return "tr";
  if (/[ąćęłńśźż]/u.test(t) || /(?<![\p{L}\p{N}_])(jest|nie|się|ludzi|są|piętro|budow|wszystko|zgodnie|planem|dzisiaj|dziś|tak)(?![\p{L}\p{N}_])/u.test(t)) return "pl";
  if (/[äöüß]/u.test(t) || /(?<![\p{L}\p{N}_])(der|die|das|ist|nicht|und|sind|wir|seit|heute|leute|uhr|schon|noch|ja|nein|stimmt|genau|alles|nach|auf|im|es|war|bitte|danke|haben|hat|kein|keine|bis|wird|wie|warten|gekommen)(?![\p{L}\p{N}_])/u.test(t)) return "de";
  if (/(?<![\p{L}\p{N}_])(și|nu|este|oameni|etaj|totul|conform|planului|azi|corect)(?![\p{L}\p{N}_])/u.test(t)) return "ro";
  if (/(?<![\p{L}\p{N}_])(ve|bir|değil|kişi|kat)(?![\p{L}\p{N}_])/u.test(t)) return "tr";
  return "en";
}

// ── Small parsers ─────────────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  eins: 1, ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
  один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
  jeden: 1, jedna: 1, dwa: 2, dwie: 2, trzy: 3, cztery: 4, pięć: 5, sześć: 6, siedem: 7, osiem: 8,
  bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8,
  unu: 1, doi: 2, două: 2, trei: 3, patru: 4, cinci: 5, șase: 6, șapte: 7,
};

// Clock hours as words ("since seven", "seit sieben", "с семи").
const HOUR_WORDS: Record<string, number> = {
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  шести: 6, семи: 7, восьми: 8, девяти: 9, десяти: 10,
  szóstej: 6, siódmej: 7, ósmej: 8, dziewiątej: 9,
  altıdan: 6, yediden: 7, sekizden: 8,
};

export function parseNumber(text: string): number | null {
  const m = text.match(/\b(\d+(?:[.,]\d+)?)\b/);
  if (m) return Number(m[1].replace(",", "."));
  for (const w of text.toLowerCase().split(/[^\p{L}]+/u)) if (w in NUMBER_WORDS) return NUMBER_WORDS[w];
  return null;
}

function parseClock(text: string): { hh: number; mm: number } | null {
  const t = text.toLowerCase();
  const m =
    t.match(/(?:since|seit|ab|from|at|um|с|od|o|de la|la)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr|h|o'clock|am|часов|час|godz)?/) ??
    t.match(/\b(\d{1,2}):(\d{2})\b/) ??
    t.match(/\b(\d{1,2})\s*(?:uhr|o'clock|часов|godz)/);
  if (m) {
    const hh = Number(m[1]);
    if (hh >= 0 && hh <= 23) return { hh, mm: m[2] ? Number(m[2]) : 0 };
  }
  for (const [w, h] of Object.entries(HOUR_WORDS)) if (t.includes(w)) return { hh: h, mm: 0 };
  return null;
}

function relativeDay(text: string, today: string): string | null {
  const t = text.toLowerCase();
  if (/(?<![\p{L}\p{N}_])(today|heute|this morning|heute früh|сегодня|dzisiaj|dziś|bugün|azi|astăzi)(?![\p{L}\p{N}_])/u.test(t)) return today;
  if (/(?<![\p{L}\p{N}_])(yesterday|gestern|вчера|wczoraj|dün|ieri)(?![\p{L}\p{N}_])/u.test(t)) return addCalendarDays(today, -1);
  if (/(?<![\p{L}\p{N}_])(tomorrow|morgen|завтра|jutro|yarın|mâine)(?![\p{L}\p{N}_])/u.test(t)) return addCalendarDays(today, 1);
  const dm = t.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})?/);
  if (dm) return `${dm[3] ?? today.slice(0, 4)}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
  const days: [RegExp, number][] = [
    [/(?<![\p{L}\p{N}_])(monday|montag|понедельник|poniedziałek|pazartesi|luni)(?![\p{L}\p{N}_])/u, 1],
    [/(?<![\p{L}\p{N}_])(tuesday|dienstag|вторник|wtorek|salı|marți)(?![\p{L}\p{N}_])/u, 2],
    [/(?<![\p{L}\p{N}_])(wednesday|mittwoch|среду|среда|środa|çarşamba|miercuri)(?![\p{L}\p{N}_])/u, 3],
    [/(?<![\p{L}\p{N}_])(thursday|donnerstag|четверг|czwartek|perşembe|joi)(?![\p{L}\p{N}_])/u, 4],
    [/(?<![\p{L}\p{N}_])(friday|freitag|пятницу|пятница|piątek|cuma|vineri)(?![\p{L}\p{N}_])/u, 5],
    [/(?<![\p{L}\p{N}_])(saturday|samstag|субботу|суббота|sobota|cumartesi|sâmbătă)(?![\p{L}\p{N}_])/u, 6],
  ];
  for (const [re, wd] of days) {
    if (re.test(t)) {
      let d = addCalendarDays(today, 1);
      while (weekday(d) !== wd) d = addCalendarDays(d, 1);
      return d;
    }
  }
  return null;
}

function parseArea(text: string): string | null {
  const t = text.toLowerCase();
  const og = t.match(/\b(\d)\s*\.?\s*og\b/);
  if (og) return `${og[1]}.OG`;
  const ordinals: [RegExp, number][] = [
    [/(first floor|erste[nm]? (stock|geschoss|og)|перв\S* этаж|pierwsz\S* piętr|birinci kat|etajul 1)/, 1],
    [/(second floor|zweite[nm]? (stock|geschoss|og)|втор\S* этаж|drugi\S* piętr|ikinci kat|etajul 2)/, 2],
    [/(third floor|dritte[nm]? (stock|geschoss|og)|трет\S* этаж|trzeci\S* piętr|üçüncü kat|etajul 3)/, 3],
  ];
  for (const [re, n] of ordinals) if (re.test(t)) return `${n}.OG`;
  if (/(ground floor|erdgeschoss|\beg\b|первый этаж|parter|zemin kat|parter)/.test(t)) return "EG";
  if (/(tiefgarage|underground car park|basement|keller|подвал|garaż podziemny|bodrum)/.test(t)) return "Tiefgarage";
  return null;
}

function parsePeople(text: string): number | null {
  const t = text.toLowerCase();
  const m = t.match(/(\d+|\p{L}+)\s+(people|persons|men|workers|guys|leute|personen|mann|arbeiter|человек|людей|рабочих|osoby|osób|ludzi|kişi|işçi|oameni|muncitori)/u);
  if (!m) return null;
  return /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]] ?? null;
}

function parseDuration(text: string): string | null {
  const t = text.toLowerCase();
  const m = t.match(/(\d+|\p{L}+)\s+(working days|days|day|arbeitstage|tage|tag|дня|дней|день|dni|dzień|gün|zile|zi)(?![\p{L}\p{N}_])/u);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
    if (n) return `ca. ${n} ${n === 1 ? "Arbeitstag" : "Arbeitstage"}`;
  }
  const h = t.match(/(\d+|\p{L}+)\s+(hours|hour|stunden|stunde|часа|часов|час|godzin|saat|ore)(?![\p{L}\p{N}_])/u);
  if (h) {
    const n = /^\d+$/.test(h[1]) ? Number(h[1]) : NUMBER_WORDS[h[1]];
    if (n) return `ca. ${n} ${n === 1 ? "Stunde" : "Stunden"}`;
  }
  const w = t.match(/(\d+|\p{L}+)\s+(weeks|week|wochen|woche|недел\S*|tygodni\S*|hafta|săptămân\S*)/u);
  if (w) {
    const n = /^\d+$/.test(w[1]) ? Number(w[1]) : NUMBER_WORDS[w[1]];
    if (n) return `ca. ${n} ${n === 1 ? "Woche" : "Wochen"}`;
  }
  if (/(end of (the )?week|ende der woche|до конца недели|do końca tygodnia)/.test(t)) return "bis Ende der Woche";
  return null;
}

const YES = /^\s*(yes|yeah|yep|correct|right|exactly|that's right|ja|jawohl|genau|stimmt|richtig|passt|да|верно|правильно|всё верно|так|tak|zgadza|dokładnie|evet|doğru|aynen|da|corect|exact)(?![\p{L}\p{N}_])/iu;
const NO = /^\s*(no|nope|not quite|nein|nicht ganz|нет|не совсем|nie|hayır|nu)(?![\p{L}\p{N}_])/iu;
const DONT_KNOW = /(don't know|do not know|no idea|not sure|weiß (ich )?nicht|keine ahnung|unklar|kann ich nicht sagen|не знаю|понятия не имею|nie wiem|bilmiyorum|nu știu)/i;
const END = /(that's all|that is all|bye|goodbye|tschüss|das war('s| es| alles)|auf wiederhören|до свидания|это всё|все,? спасибо|всё,? спасибо|to wszystko|do widzenia|hepsi bu|hoşça kal|asta e tot|la revedere)/i;

const BLOCK_WORDS =
  /(not cleared|haven't cleared|hasn't cleared|not finished|haven't finished|blocking|blocked|in the way|nicht fertig|nicht freigegeben|nicht geräumt|blockier|behinder|не освободили|не закончили|не готов|блокир|мешают|nie skończyli|nie zwolnili|blokuj|bitirmedi|boşaltmadı|engelliyor|nu au terminat|nu au eliberat|blochea)/i;
const NO_SHOW = /(didn't come|did not come|haven't come|not come|no-show|didn't show|nicht gekommen|nicht erschienen|nicht da|не пришли|не приехали|nie przyszli|nie przyjechali|gelmedi|nu au venit)/i;
const WEATHER = /(storm|sturm|gale|wind|regen|rain|frost|gewitter|thunder|snow|schnee|hagel|hail|ураган|шторм|ветер|дожд|гроза|снег|мороз|burza|wiatr|deszcz|mróz|śnieg|fırtına|rüzgar|yağmur|kar|furtună|vânt|ploaie|ninsoare)/i;
const INSTRUCTION =
  /(said|told|asked|ordered|instructed|wants|sagte|gesagt|angeordnet|verlangt|will|möchte|сказал|велел|попросил|поручил|потребовал|powiedział|kazał|polecił|zlecił|dedi|istedi|a spus|a cerut)/i;
const EXTRA = /(additional|extra|more|zusätzlich|weitere|mehr|дополнительн|ещё|dodatkow|ek |ilave|suplimentar)/i;
const ALL_GOOD = /(alles nach plan|alles läuft|läuft nach plan|all according to plan|everything (is )?(on|according to) (plan|schedule)|all good|всё по плану|все по плану|wszystko zgodnie z planem|wszystko w porządku|her şey plana göre|totul conform planului)/i;
const QTY = /(\d+(?:[.,]\d+)?)\s*(m²|m2|qm|quadratmeter|square met\w*|sq\.? ?m|кв\.?\s?м|м²|m kw|metr\w* kw|metrekare|mp)(?![\p{L}\p{N}_])/iu;
const OWN_CREW = /(our |unsere?|wir |we |наша|наши|мы |nasza|nasi|my |bizim|biz |echipa noastră|noi )/i;
const RESOLVED = /(cleared|finished now|can (work|continue) again|wieder frei|freigegeben|fertig geworden|können wieder|weiter arbeiten|освободили|закончили|можем работать|zwolnili|możemy pracować|boşalttı|bitti|au eliberat|putem lucra)/i;

const DOOR = /(brandschutztür|fire door|противопожарн\S* двер|drzwi przeciwpożar|yangın kapı|uși antifoc)/i;

function splitSegments(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|(?<![\p{L}\p{N}_])(?:außerdem|also|and also|plus|кроме того|также|ponadto|poza tym|ayrıca|de asemenea)(?![\p{L}\p{N}_])/iu)
    .map((s) => s?.trim())
    .filter((s): s is string => !!s && s.length > 2);
}

function germanCause(tradeName: string | null, text: string, area: string | null): string {
  const where = area ? ` im ${area}` : "";
  if (NO_SHOW.test(text)) return `Die Kolonne des Gewerks ${tradeName ?? "Nachunternehmer"} ist nicht auf der Baustelle erschienen.`;
  if (tradeName === "Elektro") return `Die Elektroarbeiten${where} sind nicht abgeschlossen; der Bereich ist nicht freigegeben.`;
  if (tradeName) return `Die Vorleistung des Gewerks ${tradeName}${where} ist nicht abgeschlossen; der Bereich ist nicht freigegeben.`;
  return text.trim();
}

function tradeWordIn(text: string, ctx: ExtractContext): string | null {
  const words = text.toLowerCase().split(/[^\p{L}-]+/u).filter(Boolean);
  for (const w of words) {
    const t = resolveTrade(w, ctx.trades.map((name, i) => ({ id: String(i), project_id: "", name, contracted_by: "us", contact_id: null, team_id: null })));
    if (t && t.name !== ctx.teamTrade) return w;
  }
  // Two-word aliases ("dry wall", "floor cover").
  for (const name of ctx.trades) {
    if (name === ctx.teamTrade) continue;
    const t = resolveTrade(text, [{ id: "x", project_id: "", name, contracted_by: "us", contact_id: null, team_id: null }]);
    if (t) return name;
  }
  // Trades that are not in the project ("Fensterbauer") → sphere unclear, Klara asks.
  for (const w of words) {
    const canon = canonicalTradeName(w);
    if (canon && canon.toLowerCase() !== w && canon !== ctx.teamTrade) return w;
  }
  return null;
}

function eventsFrom(segment: string, ctx: ExtractContext, today: string): ExtractedEvent[] {
  const area = parseArea(segment);
  const clock = parseClock(segment);
  const day = relativeDay(segment, today) ?? (clock ? today : null);
  const startAt = clock && day ? berlinTime(day, clock.hh, clock.mm).toISOString() : null;
  const people = parsePeople(segment);
  const ownCrew = OWN_CREW.test(segment) || (ctx.teamTrade ? resolveTrade(segment, [{ id: "t", project_id: "", name: ctx.teamTrade, contracted_by: "us", contact_id: null, team_id: null }]) !== null : false);
  const affected = ownCrew && ctx.teamTrade ? `${ctx.teamTrade}arbeiten${area ? ` ${area}` : ""}` : null;

  // Verbal instruction for extra work → Mehrkosten + Anordnung.
  if (INSTRUCTION.test(segment) && (EXTRA.test(segment) || DOOR.test(segment)) && /(architekt|architect|архитект|bauherr|client|owner|заказчик|inwestor|weber|lang)/i.test(segment)) {
    const who = /weber|architekt|architect|архитект|mimar|arhitect/i.test(segment)
      ? "Thomas Weber (Architekt)"
      : /lang|bauherr|client|owner|заказчик|inwestor/i.test(segment)
        ? "Dr. Petra Lang (Bauherr)"
        : null;
    const n = parseNumber(segment);
    const description = DOOR.test(segment)
      ? `Lieferung und Einbau von ${n ?? ""} zusätzlichen Brandschutztüren${area ? ` im ${area}` : ""}`.replace("von  ", "von ")
      : segment.trim();
    const facts: Record<string, unknown> = { description, instruction_text: description, verbal: true };
    if (who) facts.instructed_by = who;
    if (day && /(today|heute|сегодня|dzisiaj|dziś|bugün|azi|yesterday|gestern|вчера|wczoraj|dün|ieri)/i.test(segment)) facts.instruction_date = day;
    if (/(already started|schon (begonnen|angefangen)|bereits begonnen|уже начали|już zacz|başladık|am început deja)/i.test(segment)) facts.work_started = true;
    return [{ doc_type: "mehrkostenanzeige", trade_name_guess: null, cause_kind: "other", facts, confidence: 0.86 }];
  }

  // Weather.
  if (WEATHER.test(segment)) {
    const crane = /(kran|crane|кран|dźwig|vinç|macara)/i.test(segment);
    const facts: Record<string, unknown> = {
      cause: crane ? "Sturm; der Kranbetrieb ist nicht möglich." : "Witterungsbedingt ist die Ausführung nicht möglich.",
    };
    if (area) facts.area = area;
    if (startAt) facts.start_at = startAt;
    if (people !== null) facts.idle_staff = people;
    if (crane) facts.idle_equipment = "Turmdrehkran";
    if (affected) facts.affected_works = affected;
    return [{ doc_type: "behinderungsanzeige", trade_name_guess: null, cause_kind: "weather", facts, confidence: 0.84 }];
  }

  // Hindrance ended.
  const tradeWord = tradeWordIn(segment, ctx);
  // "haven't cleared" is a block, "cleared" alone means the hindrance is over.
  if (RESOLVED.test(segment) && !BLOCK_WORDS.test(segment)) {
    const facts: Record<string, unknown> = {};
    if (startAt) {
      facts.end_at = startAt;
      facts.resumed_at = startAt;
    }
    return [{ doc_type: "behinderung_ende", trade_name_guess: tradeWord, cause_kind: "trade", facts, confidence: 0.8 }];
  }

  // Another trade blocks us, or a subcontractor did not show up.
  if (tradeWord && (BLOCK_WORDS.test(segment) || NO_SHOW.test(segment))) {
    const tradeName = resolveTrade(tradeWord, ctx.trades.map((name, i) => ({ id: String(i), project_id: "", name, contracted_by: "us", contact_id: null, team_id: null })))?.name ?? null;
    const facts: Record<string, unknown> = { cause: germanCause(tradeName, segment, area) };
    if (area) facts.area = area;
    if (startAt) facts.start_at = startAt;
    if (people !== null) facts.idle_staff = people;
    if (affected) facts.affected_works = affected;
    return [{ doc_type: "behinderungsanzeige", trade_name_guess: tradeWord, cause_kind: "trade", facts, confidence: 0.9 }];
  }

  // Our own people were idle, cause given in another segment.
  if (people !== null || startAt) {
    const facts: Record<string, unknown> = {};
    if (people !== null) facts.idle_staff = people;
    if (startAt) facts.start_at = startAt;
    if (area) facts.area = area;
    if (affected) facts.affected_works = affected;
    return [{ doc_type: "behinderungsanzeige", trade_name_guess: null, cause_kind: "unknown", facts, confidence: 0.5 }];
  }
  return [];
}

/** Merge the facts of follow-up segments ("…, four people waiting") into the main event. */
function mergeEvents(list: ExtractedEvent[]): ExtractedEvent[] {
  const out: ExtractedEvent[] = [];
  for (const ev of list) {
    const same = out.find((o) => o.doc_type === ev.doc_type);
    if (same) {
      same.facts = { ...ev.facts, ...same.facts };
      same.trade_name_guess ??= ev.trade_name_guess;
      if (same.cause_kind === "unknown") same.cause_kind = ev.cause_kind;
      same.confidence = Math.max(same.confidence, ev.confidence);
    } else out.push({ ...ev, facts: { ...ev.facts } });
  }
  // "Estricharbeiten" from one sentence, "2.OG" from another.
  for (const ev of out) {
    const { affected_works: aw, area } = ev.facts;
    if (typeof aw === "string" && typeof area === "string" && !aw.includes(area)) ev.facts.affected_works = `${aw} ${area}`;
  }
  return out;
}

function answerFor(field: string, text: string, today: string): unknown {
  const t = text.toLowerCase();
  switch (field) {
    case "start_at":
    case "end_at":
    case "resumed_at": {
      const clock = parseClock(t);
      const day = relativeDay(t, today) ?? today;
      return clock ? berlinTime(day, clock.hh, clock.mm).toISOString() : null;
    }
    case "instruction_date":
    case "planned_start":
      return relativeDay(t, today);
    case "work_started":
      if (/(not yet|noch nicht|nein|no\b|ещё не|еще не|нет|jeszcze nie|nie|henüz|încă nu|nu)/i.test(t)) return false;
      if (/(yes|already|ja|schon|bereits|да|уже|tak|już|evet|başladık|da|deja)/i.test(t)) return true;
      return null;
    case "idle_staff": {
      return parsePeople(t) ?? parseNumber(t);
    }
    case "expected_duration":
      return parseDuration(t) ?? text.trim();
    case "area":
      return parseArea(t) ?? text.trim();
    case "estimate_eur":
      return parseNumber(t.replace(/\./g, ""));
    default:
      return text.trim();
  }
}

/** Corrections after a readback ("no, the third floor"): fields of open cases found in the text. */
function correctionsFrom(text: string, ctx: ExtractContext, today: string): Record<string, unknown> {
  const keys = new Set(ctx.openCases.flatMap((c) => getDocType(c.doc_type)?.fields.map((f) => f.key) ?? []));
  const t = text.toLowerCase();
  const out: Record<string, unknown> = {};
  const area = parseArea(t);
  if (area && keys.has("area")) out.area = area;
  const people = parsePeople(t);
  if (people !== null && keys.has("idle_staff")) out.idle_staff = people;
  const clock = parseClock(t);
  if (clock && keys.has("start_at")) out.start_at = berlinTime(relativeDay(t, today) ?? today, clock.hh, clock.mm).toISOString();
  const dur = parseDuration(t);
  if (dur && keys.has("expected_duration")) out.expected_duration = dur;
  return out;
}

export function mockExtract(text: string, ctx: ExtractContext): Extraction {
  const lang = ctx.language && ctx.language !== "auto" ? ctx.language : guessLanguage(text);
  const today = berlinDay(new Date(ctx.nowIso));
  const base: Extraction = {
    intent: "smalltalk",
    events: [],
    answers: {},
    declined_fields: [],
    hired_by: null,
    progress: [],
    diary_note: null,
    reply_language: lang,
    text_de: null,
  };
  const t = text.trim();

  if (END.test(t) && t.split(/\s+/).length <= 6) return { ...base, intent: "end_call" };

  const looksLikeReport = BLOCK_WORDS.test(t) || NO_SHOW.test(t) || WEATHER.test(t) || INSTRUCTION.test(t);

  if (ctx.awaitingConfirm) {
    if (YES.test(t)) return { ...base, intent: "confirm" };
    const corrections = correctionsFrom(t, ctx, today);
    if (NO.test(t)) return { ...base, intent: "deny", answers: corrections };
    if (Object.keys(corrections).length && !looksLikeReport) return { ...base, intent: "deny", answers: corrections };
  }

  if (ctx.pendingSphereQuestion) {
    if (DONT_KNOW.test(t)) return { ...base, intent: "answer_question", hired_by: "unknown" };
    if (/(client|owner|bauherr|auftraggeber|заказчик|inwestor|işveren|beneficiar)/i.test(t)) return { ...base, intent: "answer_question", hired_by: "client" };
    if (/(?<![\p{L}\p{N}_])(us|we|wir|uns|мы|нас|my|nas|biz|noi)(?![\p{L}\p{N}_])/iu.test(t)) return { ...base, intent: "answer_question", hired_by: "us" };
  }

  if (ctx.pendingQuestion) {
    const field = ctx.pendingQuestion.field;
    if (DONT_KNOW.test(t)) return { ...base, intent: "answer_question", declined_fields: [field] };
    const v = answerFor(field, t, today);
    // A plain answer to the question; a new report goes through the event path below.
    if (v !== null && v !== "" && !looksLikeReport) return { ...base, intent: "answer_question", answers: { [field]: v } };
  }

  if (ALL_GOOD.test(t)) return { ...base, intent: "diary_answer", diary_note: "Arbeiten nach Plan, keine besonderen Vorkommnisse." };

  // "Estrich 2.OG heute: 15" from the evening card, unit implied by the schedule item.
  const evening = /(heute|today|сегодня|dzisiaj|dziś|bugün|azi)\s*:?\s*(?:nur|only|только|tylko|sadece|doar)?\s*(\d+(?:[.,]\d+)?)\s*$/iu.exec(t);
  const qty = t.match(QTY) ?? (evening ? [evening[0], evening[2]] : null);
  if (qty) {
    const tw = resolveTrade(t, ctx.trades.map((name, i) => ({ id: String(i), project_id: "", name, contracted_by: "us", contact_id: null, team_id: null })));
    const progress: ProgressReport = {
      trade: tw?.name ?? ctx.teamTrade,
      area: parseArea(t),
      qty: Number(qty[1].replace(",", ".")),
      unit: "m²",
      note: null,
    };
    return { ...base, intent: "diary_answer", progress: [progress] };
  }

  const events = mergeEvents(splitSegments(t).flatMap((s) => eventsFrom(s, ctx, today)));
  if (events.length) {
    // Idle crew without a recognisable cause stays a low-confidence hindrance → clarifying question.
    return { ...base, intent: "report_event", events };
  }

  if (ctx.awaitingConfirm && t.split(/\s+/).length <= 3) return { ...base, intent: "confirm" };
  if (/^(hi|hello|hallo|guten (morgen|tag)|привет|здравствуйте|cześć|dzień dobry|merhaba|bună)/i.test(t)) return { ...base, intent: "smalltalk" };
  return { ...base, intent: "report_event", events: [{ doc_type: "none", trade_name_guess: null, cause_kind: "unknown", facts: {}, confidence: 0.3 }] };
}
