// Pre-written Klara lines (SPEC latency tip). en is the source; other languages
// without an entry are phrased by the LLM in live mode.
export type Lang = string;
type Line = Partial<Record<Lang, string>> & { en: string };

export const LINES = {
  clarify: {
    en: "Could you tell me a bit more about what happened, and where?",
    de: "Können Sie mir etwas genauer sagen, was passiert ist, und wo?",
    ru: "Расскажите, пожалуйста, подробнее, что случилось и где?",
    pl: "Czy może Pan powiedzieć dokładniej, co się stało i gdzie?",
    tr: "Ne olduğunu ve nerede olduğunu biraz daha anlatır mısınız?",
  },
  askSphere: {
    en: "Who hired the {trade}: the client, or our company?",
    de: "Wer hat das Gewerk {trade} beauftragt: der Bauherr oder wir?",
    ru: "Кто нанял {trade}: заказчик или наша фирма?",
    pl: "Kto zlecił {trade}: inwestor czy nasza firma?",
    tr: "{trade} işini kim verdi: işveren mi, bizim firma mı?",
  },
  askSphereUnknown: {
    en: "Who is causing the hold-up, and who hired them: the client, or our company?",
    de: "Wer verursacht die Behinderung, und wer hat ihn beauftragt: der Bauherr oder wir?",
    ru: "Кто мешает работе и кто их нанял: заказчик или наша фирма?",
    pl: "Kto blokuje pracę i kto go zlecił: inwestor czy nasza firma?",
    tr: "İşi kim engelliyor ve onları kim tuttu: işveren mi, bizim firma mı?",
  },
  readbackIntro: {
    en: "Let me read that back.",
    de: "Ich fasse zusammen.",
    ru: "Давайте я повторю.",
    pl: "Podsumuję.",
    tr: "Özetliyorum.",
  },
  readbackOutro: {
    en: "Is that correct?",
    de: "Stimmt das so?",
    ru: "Всё верно?",
    pl: "Czy to się zgadza?",
    tr: "Doğru mu?",
  },
  created: {
    en: "Thank you. I've prepared the document. The site manager will check it before anything is sent.",
    de: "Danke. Ich habe das Schreiben vorbereitet. Die Bauleitung prüft es, bevor etwas versendet wird.",
    ru: "Спасибо. Я подготовила документ. Прораб проверит его перед отправкой.",
    pl: "Dziękuję. Przygotowałam dokument. Kierownik budowy sprawdzi go przed wysłaniem.",
    tr: "Teşekkürler. Belgeyi hazırladım. Şantiye şefi göndermeden önce kontrol edecek.",
  },
  createdMany: {
    en: "Thank you. I've prepared {n} documents. The site manager will check them before anything is sent.",
    de: "Danke. Ich habe {n} Schreiben vorbereitet. Die Bauleitung prüft sie, bevor etwas versendet wird.",
    ru: "Спасибо. Я подготовила {n} документа. Прораб проверит их перед отправкой.",
    pl: "Dziękuję. Przygotowałam {n} dokumenty. Kierownik budowy sprawdzi je przed wysłaniem.",
    tr: "Teşekkürler. {n} belge hazırladım. Şantiye şefi göndermeden önce kontrol edecek.",
  },
  denyAsk: {
    en: "What should I correct?",
    de: "Was soll ich korrigieren?",
    ru: "Что нужно исправить?",
    pl: "Co mam poprawić?",
    tr: "Neyi düzeltmeliyim?",
  },
  goodbye: {
    en: "Thank you, goodbye!",
    de: "Danke, auf Wiederhören!",
    ru: "Спасибо, до свидания!",
    pl: "Dziękuję, do widzenia!",
    tr: "Teşekkürler, hoşça kalın!",
  },
  diaryNoted: {
    en: "Thanks, I've noted that in today's site diary.",
    de: "Danke, ist im heutigen Bautagesbericht notiert.",
    ru: "Спасибо, записала в сегодняшний журнал работ.",
    pl: "Dziękuję, zapisałam w dzisiejszym dzienniku budowy.",
    tr: "Teşekkürler, bugünkü şantiye günlüğüne not ettim.",
  },
  ownTeamNoted: {
    en: "Noted in the site diary. I've also flagged it internally for the site manager.",
    de: "Im Bautagesbericht notiert. Ich habe es zusätzlich intern für die Bauleitung markiert.",
    ru: "Записала в журнал работ и отметила для прораба.",
    pl: "Zapisałam w dzienniku budowy i oznaczyłam dla kierownika budowy.",
    tr: "Şantiye günlüğüne not ettim ve şantiye şefi için işaretledim.",
  },
  subcontractorNote: {
    en: "{trade} works for our company, so I'll prepare a notice to them instead.",
    de: "{trade} ist unser Nachunternehmer, daher bereite ich stattdessen ein Schreiben an ihn vor.",
    ru: "{trade} работают на нашу фирму, поэтому я подготовлю письмо им.",
    pl: "{trade} pracuje dla naszej firmy, więc przygotuję pismo do nich.",
    tr: "{trade} bizim firmamız için çalışıyor, bu yüzden onlara bir yazı hazırlayacağım.",
  },
  smalltalk: {
    en: "I'm listening. What happened on site?",
    de: "Ich höre. Was ist auf der Baustelle passiert?",
    ru: "Слушаю. Что случилось на стройке?",
    pl: "Słucham. Co się stało na budowie?",
    tr: "Dinliyorum. Şantiyede ne oldu?",
  },
  stillThere: {
    en: "Anything else?",
    de: "Sonst noch etwas?",
    ru: "Что-нибудь ещё?",
    pl: "Coś jeszcze?",
    tr: "Başka bir şey var mı?",
  },
} satisfies Record<string, Line>;

export type LineKey = keyof typeof LINES;

export function fill(s: string, vars: Record<string, string | number> = {}): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
