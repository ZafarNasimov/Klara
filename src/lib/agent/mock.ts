// Keyword-based stand-in for the LLM extractor (LLM_MODE=mock). Lets the UI
// and the deterministic pipeline run without an API key. It is deliberately
// simple and is NOT the real agent; the eval runs against the live model.
import { berlinDay, berlinTime } from "@/lib/deadlines";
import { getDocType } from "@/lib/doctypes";
import { canonicalTradeName } from "@/lib/rules/sphere";
import type { ExtractContext, ExtractedEvent, Extraction } from "./types";

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eins: 1, ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  один: 1, два: 2, двое: 2, три: 3, трое: 3, четыре: 4, четверо: 4, пять: 5, пятеро: 5, шесть: 6, семь: 7, восемь: 8,
  jeden: 1, dwa: 2, dwóch: 2, trzy: 3, trzech: 3, cztery: 4, czterech: 4, pięć: 5, pięciu: 5, siedem: 7, osiem: 8,
  bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8,
};

const SEVEN_ETC: Record<string, number> = {
  six: 6, seven: 7, eight: 8, nine: 9, sechs: 6, sieben: 7, acht: 8, neun: 9,
  шести: 6, семи: 7, восьми: 8, девяти: 9, szóstej: 6, siódmej: 7, ósmej: 8, dziewiątej: 9,
  altıdan: 6, yediden: 7, sekizden: 8, dokuzdan: 9,
};

const ORDINAL_FLOOR: [RegExp, number][] = [
  [/\b(first|ersten|erste|перв\w*|pierwsz\w*|birinci)\b/i, 1],
  [/\b(second|zweiten|zweite|втор\w*|drugi\w*|ikinci)\b/i, 2],
  [/\b(third|dritten|dritte|трет\w*|trzeci\w*|üçüncü)\b/i, 3],
  [/\b(fourth|vierten|четв\w*|czwart\w*|dördüncü)\b/i, 4],
];

const TRADE_WORDS = /(elektr\w*|electric\w*|электр\w*|trockenbau\w*|drywall|гипсокартон\w*|sucha zabudowa|alçıpan\w*|estrich\w*|screed|стяжк\w*|jastrych\w*|şap|bodenbelag\w*|flooring|linoleum|sanitär\w*|plumb\w*|сантех\w*|hydraulik\w*|tesisat\w*)/i;

const RX = {
  confirm: /^\s*(yes|yeah|yep|correct|right|that'?s right|ja|jawohl|genau|richtig|stimmt|да|верно|так|tak|zgadza się|evet|doğru)\b/i,
  deny: /^\s*(no|nope|nein|нет|не так|nie|hayır)\b/i,
  endCall: /(that'?s all|bye|goodbye|tschüss|auf wiederhören|до свидания|пока|это всё|to wszystko|do widzenia|hoşça kal|görüşürüz)/i,
  dontKnow: /(don'?t know|no idea|unknown|not sure|weiß (ich )?nicht|keine ahnung|unklar|не знаю|неизвестно|nie wiem|bilmiyorum|belli değil)/i,
  weather: /(storm|sturm|wind|gale|rain|regen|frost|schnee|snow|hagel|буря|шторм|ветер|дождь|снег|мороз|burza|wiatr|deszcz|śnieg|mróz|fırtına|rüzgar|yağmur|kar)/i,
  instruction: /(architekt|architect|архитектор|mimar|bauherr|bauleitung des bauherrn).{0,60}(said|told|asked|wants|sagte|gesagt|will|möchte|verlangt|angeordnet|сказал|просил|велел|powiedział|kazał|chce|dedi|istedi)|(mündlich|verbal|устно|ustnie|sözlü)/i,
  hindrance: /(haven'?t (cleared|finished|come)|not (cleared|finished|done|ready)|didn'?t (come|show)|blocked|blocking|can'?t (work|start|continue)|waiting|standing idle|been standing|nicht (fertig|freigegeben|gekommen|erschienen)|blockier|behinder|warten|stehen still|stillstand|не (пришли|закончили|освободили|готов)|мешают|блокир|ждём|ждем|стоим|простаива|nie (przyszli|skończyli|ma)|blokuj|czekamy|stoimy|gelmedi|bitirmedi|bekliyoruz|duruyoruz)/i,
  ende: /(can work again|cleared now|is cleared|released now|wieder arbeiten|jetzt frei|wurde freigegeben|ist freigegeben|можем снова|можно работать|освободили|możemy znowu|już wolne|tekrar çalış|serbest bırakıldı)/i,
  diary: /(alles nach plan|all according to plan|everything (is )?(on|according to) plan|all good today|всё по плану|все по плану|wszystko zgodnie z planem|wszystko według planu|her şey plana göre|\d+\s?(m²|m2|qm|quadratmeter))/i,
  people: /(\d+|[a-zäöüßа-яёąćęłńóśźżçğıöşü]+)\s+(people|persons|men|guys|workers|crew members|leute|mann|arbeiter|personen|человек|люд\w*|рабоч\w*|ludzi|osób|pracownik\w*|kişi|işçi)/i,
  fireDoor: /(brandschutzt\w*|fire ?doors?|противопожарн\w*|przeciwpożarow\w*|yangın kapı\w*)/i,
  hiredClient: /(client|customer|owner|bauherr|auftraggeber|заказчик|инвестор|inwestor|zleceniodawc|işveren|müşteri|mal sahibi)/i,
  hiredUs: /^\s*(us|we|we did|our|wir|uns|мы|нас|my|nas|biz)\b/i,
};

function num(token: string | undefined): number | null {
  if (!token) return null;
  if (/^\d+$/.test(token)) return Number(token);
  return NUM_WORDS[token.toLowerCase()] ?? null;
}

function floor(text: string): string | null {
  const m = text.match(/(\d+)\s?\.?\s?(og|obergeschoss|stock|floor|этаж\w*|piętr\w*|kat)\b/i);
  if (m) return `${m[1]}.OG`;
  if (/\b(eg|erdgeschoss|ground floor|первый этаж|parter|zemin kat)\b/i.test(text)) return "EG";
  for (const [rx, n] of ORDINAL_FLOOR) if (rx.test(text)) return `${n}.OG`;
  return null;
}

function startTime(text: string, today: string): string | null {
  const m =
    text.match(/(?:since|seit|с|od|from)\s+(\d{1,2})(?:[:.](\d{2}))?/i) ||
    text.match(/(\d{1,2})[:.](\d{2})\s*(?:uhr|h)?/i);
  if (m) return berlinTime(today, Number(m[1]), Number(m[2] ?? 0)).toISOString();
  const w = text.toLowerCase().match(/(?:since|seit|с|od)\s+(\p{L}+)/u) || text.toLowerCase().match(/(\p{L}+)\s+beri/u);
  const h = w ? SEVEN_ETC[w[1]] : undefined;
  if (h) return berlinTime(today, h, 0).toISOString();
  if (/\b(this morning|heute früh|heute morgen|с утра|od rana|sabahtan beri)\b/i.test(text)) return null;
  return null;
}

function duration(text: string): string | null {
  const m = text.match(/(\d+|\p{L}+)\s+(days?|tage?n?|дн\w*|день|dni|dzień|gün)/iu);
  if (m && num(m[1])) return `ca. ${num(m[1])} Arbeitstage`;
  const h = text.match(/(\d+|\p{L}+)\s+(hours?|stunden?|час\w*|godzin\w*|saat)/iu);
  if (h && num(h[1])) return `ca. ${num(h[1])} Stunden`;
  if (/(tomorrow|morgen|завтра|jutro|yarın)/i.test(text)) return "voraussichtlich bis morgen";
  if (/(week|woche|недел|tydzie|hafta)/i.test(text)) return "ca. eine Woche";
  return null;
}

function parseAnswer(field: string, type: string, text: string, today: string): unknown {
  switch (type) {
    case "bool":
      if (/(yes|ja|да|tak|evet|already|schon|уже|już|zaten)/i.test(text) && !/(not yet|noch nicht|ещё нет|еще нет|jeszcze nie|henüz)/i.test(text)) return true;
      if (/(no|nein|нет|nie|hayır|not yet|noch nicht|ещё нет|еще нет|jeszcze nie|henüz)/i.test(text)) return false;
      return null;
    case "number": {
      const m = text.match(/\d+/) ?? text.toLowerCase().match(/\p{L}+/gu)?.find((w) => NUM_WORDS[w] !== undefined);
      return num(Array.isArray(m) ? m[0] : (m as string | undefined));
    }
    case "datetime":
      return startTime(text, today) ?? (/(now|jetzt|сейчас|teraz|şimdi)/i.test(text) ? new Date().toISOString() : null);
    case "date":
      if (/(today|heute|сегодня|dziś|dzisiaj|bugün)/i.test(text)) return today;
      if (/(yesterday|gestern|вчера|wczoraj|dün)/i.test(text)) {
        const d = new Date(`${today}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
      }
      if (/(tomorrow|morgen|завтра|jutro|yarın)/i.test(text)) {
        const d = new Date(`${today}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        return d.toISOString().slice(0, 10);
      }
      {
        const m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})?/);
        if (m) return `${m[3] ?? today.slice(0, 4)}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      }
      return null;
    default:
      if (field === "expected_duration") return duration(text) ?? text.trim();
      if (field === "area") return floor(text) ?? text.trim();
      return text.trim();
  }
}

export function mockExtract(text: string, ctx: ExtractContext): Extraction {
  const t = text.trim();
  const today = berlinDay(new Date(ctx.nowIso));
  const lang = ctx.language ?? guessLanguage(t);
  // The mock cannot translate; the DE subtitle stays empty for other languages.
  const base = { reply_language: lang, text_de: lang === "de" ? t : undefined };

  if (RX.endCall.test(t) && t.split(/\s+/).length <= 6) return { ...base, intent: "end_call", events: [] };

  if (ctx.awaitingConfirm) {
    if (RX.confirm.test(t)) return { ...base, intent: "confirm", events: [] };
    if (RX.deny.test(t)) return { ...base, intent: "deny", events: [], answer_facts: {} };
  }

  if (ctx.pendingSphereQuestion) {
    if (RX.hiredUs.test(t)) return { ...base, intent: "answer_question", events: [], answer_facts: { hired_by: "us" } };
    if (RX.hiredClient.test(t)) return { ...base, intent: "answer_question", events: [], answer_facts: { hired_by: "client" } };
  }

  const events = detectEvents(t, ctx, today);

  if (ctx.pendingQuestion && events.length === 0) {
    const def = getDocType(ctx.pendingQuestion.doc_type);
    const f = def?.fields.find((x) => x.key === ctx.pendingQuestion!.field);
    if (RX.dontKnow.test(t)) return { ...base, intent: "answer_question", events: [], declined_fields: [ctx.pendingQuestion.field] };
    const value = f ? parseAnswer(f.key, f.type, t, today) : t;
    const extra: Record<string, unknown> = {};
    // An idle-resources answer may also name machines.
    if (f?.key === "idle_staff") {
      const m = t.match(/(pump\w*|pumpe\w*|kran|crane|mixer|mischer|bagger|excavator|насос\w*|кран|pomp\w*|dźwig|pompa|vinç)/i);
      if (m) extra.idle_equipment = m[0];
    }
    return {
      ...base,
      intent: "answer_question",
      events: [],
      answer_facts: value === null || value === undefined ? {} : { [ctx.pendingQuestion.field]: value, ...extra },
    };
  }

  if (events.length) {
    const diaryOnly = events.every((e) => e.doc_type === "diary_only");
    return { ...base, intent: diaryOnly ? "diary_answer" : "report_event", events };
  }
  if (RX.confirm.test(t) || RX.deny.test(t)) return { ...base, intent: "smalltalk", events: [] };
  // Vague → low confidence, no case (scenario 9).
  return { ...base, intent: "report_event", events: [{ doc_type: "none", facts: {}, confidence: 0.3 }] };
}

function detectEvents(t: string, ctx: ExtractContext, today: string): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];
  const area = floor(t);
  const tradeMatch = t.match(TRADE_WORDS);
  const tradeGuess = tradeMatch ? canonicalTradeName(tradeMatch[0]) : null;

  if (RX.diary.test(t) && !RX.hindrance.test(t)) {
    events.push({ doc_type: "diary_only", facts: { note: t }, confidence: 0.9 });
    return events;
  }

  if (RX.ende.test(t) && !RX.hindrance.test(t)) {
    const end = startTime(t, today);
    events.push({ doc_type: "behinderung_ende", facts: end ? { end_at: end } : {}, confidence: 0.75 });
    return events;
  }

  const isWeather = RX.weather.test(t);
  if (isWeather || RX.hindrance.test(t)) {
    const facts: Record<string, unknown> = {};
    if (area) facts.area = area;
    const start = startTime(t, today);
    if (start) facts.start_at = start;
    const p = t.match(RX.people);
    const n = num(p?.[1]);
    if (n) facts.idle_staff = n;
    const otherTrade = tradeGuess && tradeGuess !== ctx.teamTrade ? tradeGuess : null;
    if (isWeather) {
      facts.cause = /kran|crane|кран|dźwig|vinç/i.test(t)
        ? "Sturm; Kranbetrieb aus Sicherheitsgründen eingestellt"
        : "Witterungsbedingte Unterbrechung (Sturm/Unwetter)";
      if (/kran|crane|кран|dźwig|vinç/i.test(t)) facts.idle_equipment = "Turmdrehkran";
    } else if (otherTrade) {
      facts.cause = `${otherTrade}arbeiten${area ? ` im ${area}` : ""} nicht fertiggestellt; Bereich nicht freigegeben`;
    }
    // "our screed crew" → the reporting team's own works are affected.
    if (ctx.teamTrade && tradeMatch && canonicalTradeName(tradeMatch[0]) === ctx.teamTrade) {
      facts.affected_works = `${ctx.teamTrade}arbeiten${area ? ` ${area}` : ""}`;
    } else if (ctx.teamTrade && /(our|unser|наш|nasz|bizim)/i.test(t)) {
      facts.affected_works = `${ctx.teamTrade}arbeiten${area ? ` ${area}` : ""}`;
    }
    events.push({
      doc_type: "behinderungsanzeige",
      trade_name_guess: isWeather ? null : otherTrade,
      cause_kind: isWeather ? "weather" : otherTrade ? "trade" : "unknown",
      facts,
      confidence: isWeather || otherTrade ? 0.85 : 0.65,
    });
  }

  if (RX.instruction.test(t)) {
    const shared: Record<string, unknown> = { verbal: true };
    if (/weber|architekt|architect|архитектор|mimar/i.test(t)) shared.instructed_by = "Thomas Weber (Architekt)";
    const fd = t.match(RX.fireDoor);
    const cnt = t.match(/(\d+|\p{L}+)\s+(?:\p{L}+\s+)?(brandschutzt\w*|fire ?doors?|противопожарн\w*|przeciwpożarow\w*|yangın)/iu);
    const n = num(cnt?.[1]) ?? null;
    const description = fd ? `${n ? `${n} ` : ""}zusätzliche Brandschutztüren${area ? ` im ${area}` : ""}` : null;
    if (/(today|heute|сегодня|dziś|bugün)/i.test(t)) shared.instruction_date = today;
    events.push({
      doc_type: "mehrkostenanzeige",
      facts: { ...shared, ...(description ? { description } : {}) },
      confidence: 0.8,
    });
    events.push({
      doc_type: "anordnung_bestaetigung",
      facts: { ...shared, ...(description ? { instruction_text: description } : {}), ...(area ? { place: area } : {}) },
      confidence: 0.8,
    });
  }
  return events;
}

export function guessLanguage(t: string): string {
  if (/[а-яё]/i.test(t)) return "ru";
  if (/[ąćęłńśźż]/i.test(t) || /\b(jest|nie|się|tak|piętro)\b/i.test(t)) return "pl";
  if (/[ğış]/i.test(t) || /\b(ve|bir|değil|kat)\b/i.test(t)) return "tr";
  if (/[äöüß]/i.test(t) || /\b(der|die|das|und|ist|nicht|seit|wir|heute)\b/i.test(t)) return "de";
  return "en";
}
