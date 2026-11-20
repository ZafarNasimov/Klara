// Klara's fixed lines, pre-written so no LLM call is needed (SPEC latency tip).
// Short, polite, formal address. Placeholders: {name}.
export type LineKey =
  | "clarify"
  | "clarifyGiveUp"
  | "askSphere"
  | "askSphereUnknown"
  | "readbackIntro"
  | "readbackOutro"
  | "created"
  | "createdMany"
  | "createdIncomplete"
  | "denyAsk"
  | "goodbye"
  | "diaryNoted"
  | "ownTeamNoted"
  | "subcontractorNote"
  | "notBuilt"
  | "smalltalk"
  | "stillThere"
  | "progressNoted"
  | "deviationNote"
  | "unconfirmedSaved";

type Table = Record<LineKey, string>;

export const LINES: Record<string, Table> = {
  en: {
    clarify: "Sorry, I didn't quite get that. What happened on site, and where exactly?",
    clarifyGiveUp: "I'll note it for the site manager. Is there anything else?",
    askSphere: "Who hired the {trade}: the client or us?",
    askSphereUnknown: "Who is responsible for that: the client or us?",
    readbackIntro: "Let me read it back.",
    readbackOutro: "Is that correct?",
    created: "Thank you. The document is now with the site manager for checking.",
    createdMany: "Thank you. {n} documents are now with the site manager for checking.",
    createdIncomplete: "Thank you. I've saved it; the site manager will add what is missing.",
    denyAsk: "What should I correct?",
    goodbye: "Thank you, goodbye.",
    diaryNoted: "Noted in the site diary.",
    ownTeamNoted: "Noted internally for the site manager, no letter to the client.",
    subcontractorNote: "That is our own subcontractor. I'm preparing a request to remedy for {org}.",
    notBuilt: "Noted. I've passed this on to the site manager.",
    smalltalk: "I'm here. What happened on site?",
    stillThere: "Is there anything else I should note?",
    progressNoted: "Noted: {item}, {qty} today, that is {pct} % of the plan.",
    deviationNote: "At this rate we'll be about {days} working days late. I'm preparing a notice for {successor}.",
    unconfirmedSaved: "Okay. I've saved what we have; the site manager will follow up.",
  },
  de: {
    clarify: "Entschuldigung, das habe ich nicht genau verstanden. Was ist auf der Baustelle passiert, und wo genau?",
    clarifyGiveUp: "Ich notiere das für die Bauleitung. Gibt es noch etwas?",
    askSphere: "Wer hat das Gewerk {trade} beauftragt: der Bauherr oder wir?",
    askSphereUnknown: "Wer ist dafür zuständig: der Bauherr oder wir?",
    readbackIntro: "Ich fasse zusammen.",
    readbackOutro: "Stimmt das so?",
    created: "Danke. Das Schreiben liegt jetzt der Bauleitung zur Prüfung vor.",
    createdMany: "Danke. {n} Schreiben liegen jetzt der Bauleitung zur Prüfung vor.",
    createdIncomplete: "Danke. Ich habe es gespeichert, die Bauleitung ergänzt die fehlenden Angaben.",
    denyAsk: "Was soll ich korrigieren?",
    goodbye: "Danke, auf Wiederhören.",
    diaryNoted: "Im Bautagebuch notiert.",
    ownTeamNoted: "Intern für die Bauleitung notiert, kein Schreiben an den Bauherrn.",
    subcontractorNote: "Das ist unser eigener Nachunternehmer. Ich bereite eine Abhilfeaufforderung an {org} vor.",
    notBuilt: "Notiert. Ich habe das an die Bauleitung weitergegeben.",
    smalltalk: "Ich bin da. Was ist auf der Baustelle passiert?",
    stillThere: "Gibt es noch etwas, das ich notieren soll?",
    progressNoted: "Notiert: {item}, heute {qty}, das sind {pct} % vom Plan.",
    deviationNote: "Bei diesem Tempo rechnen wir mit etwa {days} Arbeitstagen Verzug. Ich bereite eine Information an {successor} vor.",
    unconfirmedSaved: "In Ordnung. Ich habe das Bisherige gespeichert, die Bauleitung meldet sich.",
  },
  ru: {
    clarify: "Извините, я не совсем поняла. Что произошло на объекте и где именно?",
    clarifyGiveUp: "Я запишу это для руководителя. Есть ещё что-нибудь?",
    askSphere: "Кто нанял {trade}: заказчик или мы?",
    askSphereUnknown: "Кто за это отвечает: заказчик или мы?",
    readbackIntro: "Подведу итог.",
    readbackOutro: "Всё верно?",
    created: "Спасибо. Документ передан руководителю на проверку.",
    createdMany: "Спасибо. {n} документа переданы руководителю на проверку.",
    createdIncomplete: "Спасибо. Я сохранила, руководитель дополнит недостающее.",
    denyAsk: "Что нужно исправить?",
    goodbye: "Спасибо, до свидания.",
    diaryNoted: "Записала в журнал работ.",
    ownTeamNoted: "Отметила для руководителя, письмо заказчику не нужно.",
    subcontractorNote: "Это наш субподрядчик. Готовлю требование к {org}.",
    notBuilt: "Записала. Передала руководителю.",
    smalltalk: "Я на связи. Что произошло на объекте?",
    stillThere: "Есть ещё что-нибудь, что нужно записать?",
    progressNoted: "Записала: {item}, сегодня {qty}, это {pct} % от плана.",
    deviationNote: "При таком темпе отставание около {days} рабочих дней. Готовлю уведомление для {successor}.",
    unconfirmedSaved: "Хорошо. Я сохранила то, что есть, руководитель свяжется с вами.",
  },
  pl: {
    clarify: "Przepraszam, nie do końca zrozumiałam. Co się stało na budowie i gdzie dokładnie?",
    clarifyGiveUp: "Zanotuję to dla kierownika budowy. Czy coś jeszcze?",
    askSphere: "Kto zlecił prace {trade}: inwestor czy my?",
    askSphereUnknown: "Kto za to odpowiada: inwestor czy my?",
    readbackIntro: "Podsumuję.",
    readbackOutro: "Czy to się zgadza?",
    created: "Dziękuję. Dokument czeka teraz na sprawdzenie przez kierownika budowy.",
    createdMany: "Dziękuję. {n} dokumenty czekają na sprawdzenie przez kierownika budowy.",
    createdIncomplete: "Dziękuję. Zapisałam, kierownik uzupełni brakujące dane.",
    denyAsk: "Co mam poprawić?",
    goodbye: "Dziękuję, do usłyszenia.",
    diaryNoted: "Zapisane w dzienniku budowy.",
    ownTeamNoted: "Zanotowane wewnętrznie dla kierownika, bez pisma do inwestora.",
    subcontractorNote: "To nasz podwykonawca. Przygotowuję wezwanie do {org}.",
    notBuilt: "Zanotowane. Przekazałam to kierownikowi budowy.",
    smalltalk: "Jestem. Co się stało na budowie?",
    stillThere: "Czy mam jeszcze coś zanotować?",
    progressNoted: "Zanotowane: {item}, dziś {qty}, to {pct} % planu.",
    deviationNote: "W tym tempie opóźnienie wyniesie około {days} dni roboczych. Przygotowuję informację dla {successor}.",
    unconfirmedSaved: "Dobrze. Zapisałam to, co mamy, kierownik się odezwie.",
  },
  tr: {
    clarify: "Kusura bakmayın, tam anlayamadım. Şantiyede ne oldu ve tam olarak nerede?",
    clarifyGiveUp: "Şantiye şefi için not alıyorum. Başka bir şey var mı?",
    askSphere: "{trade} işini kim verdi: işveren mi, biz mi?",
    askSphereUnknown: "Bundan kim sorumlu: işveren mi, biz mi?",
    readbackIntro: "Özetliyorum.",
    readbackOutro: "Doğru mu?",
    created: "Teşekkürler. Belge şimdi şantiye şefinin kontrolünde.",
    createdMany: "Teşekkürler. {n} belge şimdi şantiye şefinin kontrolünde.",
    createdIncomplete: "Teşekkürler. Kaydettim, eksikleri şantiye şefi tamamlayacak.",
    denyAsk: "Neyi düzelteyim?",
    goodbye: "Teşekkürler, hoşça kalın.",
    diaryNoted: "Şantiye defterine not edildi.",
    ownTeamNoted: "Şantiye şefi için dahili not alındı, işverene yazı yok.",
    subcontractorNote: "Bu bizim alt yüklenicimiz. {org} için bir ihtar hazırlıyorum.",
    notBuilt: "Not aldım. Şantiye şefine ilettim.",
    smalltalk: "Buradayım. Şantiyede ne oldu?",
    stillThere: "Not almam gereken başka bir şey var mı?",
    progressNoted: "Not edildi: {item}, bugün {qty}, planın % {pct}'i.",
    deviationNote: "Bu hızla yaklaşık {days} iş günü gecikme olacak. {successor} için bir bilgilendirme hazırlıyorum.",
    unconfirmedSaved: "Tamam. Elimizdekini kaydettim, şantiye şefi sizinle iletişime geçecek.",
  },
  ro: {
    clarify: "Scuze, nu am înțeles bine. Ce s-a întâmplat pe șantier și unde exact?",
    clarifyGiveUp: "Notez asta pentru șeful de șantier. Mai este ceva?",
    askSphere: "Cine a angajat {trade}: beneficiarul sau noi?",
    askSphereUnknown: "Cine răspunde de asta: beneficiarul sau noi?",
    readbackIntro: "Rezum.",
    readbackOutro: "Este corect?",
    created: "Mulțumesc. Documentul este acum la șeful de șantier pentru verificare.",
    createdMany: "Mulțumesc. {n} documente sunt acum la șeful de șantier pentru verificare.",
    createdIncomplete: "Mulțumesc. L-am salvat, șeful de șantier completează ce lipsește.",
    denyAsk: "Ce să corectez?",
    goodbye: "Mulțumesc, la revedere.",
    diaryNoted: "Notat în jurnalul de șantier.",
    ownTeamNoted: "Notat intern pentru șeful de șantier, fără scrisoare către beneficiar.",
    subcontractorNote: "Este subcontractorul nostru. Pregătesc o somație către {org}.",
    notBuilt: "Notat. Am transmis șefului de șantier.",
    smalltalk: "Sunt aici. Ce s-a întâmplat pe șantier?",
    stillThere: "Mai e ceva ce trebuie să notez?",
    progressNoted: "Notat: {item}, azi {qty}, adică {pct} % din plan.",
    deviationNote: "În acest ritm vom avea o întârziere de circa {days} zile lucrătoare. Pregătesc o informare pentru {successor}.",
    unconfirmedSaved: "Bine. Am salvat ce avem, șeful de șantier revine.",
  },
};

export function fill(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Names of document types as Klara says them on the phone. */
export const DOC_SPOKEN: Record<string, Record<string, string>> = {
  en: {
    behinderungsanzeige: "Hindrance notice",
    behinderung_ende: "Notice that the hindrance has ended",
    mehrkostenanzeige: "Notice of extra costs",
    anordnung_bestaetigung: "Confirmation of the verbal instruction",
    verzug_nu: "Request to remedy to the subcontractor",
  },
  de: {
    behinderungsanzeige: "Behinderungsanzeige",
    behinderung_ende: "Anzeige Wegfall der Behinderung",
    mehrkostenanzeige: "Ankündigung Mehrvergütung",
    anordnung_bestaetigung: "Bestätigung der mündlichen Anordnung",
    verzug_nu: "Abhilfeaufforderung an den Nachunternehmer",
  },
  ru: {
    behinderungsanzeige: "Уведомление о препятствии",
    behinderung_ende: "Уведомление об окончании препятствия",
    mehrkostenanzeige: "Уведомление о дополнительных расходах",
    anordnung_bestaetigung: "Подтверждение устного указания",
    verzug_nu: "Требование к субподрядчику",
  },
};

/** Short labels for the readback (en/de/ru; other languages are phrased by the LLM). */
export const READBACK_LABELS: Record<string, Record<string, string>> = {
  en: {
    start_at: "since",
    area: "area",
    cause: "cause",
    affected_works: "affected",
    idle_staff: "idle workers",
    idle_equipment: "idle equipment",
    expected_duration: "expected duration",
    description: "requested work",
    instructed_by: "requested by",
    instruction_date: "date",
    instruction_time: "time",
    place: "place",
    instruction_text: "wording",
    witnesses: "present",
    work_started: "already started",
    planned_start: "planned start",
    estimate_eur: "estimate",
    end_at: "ended",
    resumed_at: "resumed",
    still_affected: "still affected",
  },
  de: {
    start_at: "seit",
    area: "Bereich",
    cause: "Ursache",
    affected_works: "betroffen",
    idle_staff: "Arbeitskräfte ohne Einsatz",
    idle_equipment: "Geräte",
    expected_duration: "voraussichtliche Dauer",
    description: "Leistung",
    instructed_by: "angeordnet von",
    instruction_date: "Datum",
    instruction_time: "Uhrzeit",
    place: "Ort",
    instruction_text: "Wortlaut",
    witnesses: "anwesend",
    work_started: "bereits begonnen",
    planned_start: "geplanter Beginn",
    estimate_eur: "Schätzung",
    end_at: "entfallen",
    resumed_at: "wieder aufgenommen",
    still_affected: "fortwirkend",
  },
  ru: {
    start_at: "с",
    area: "участок",
    cause: "причина",
    affected_works: "затронуто",
    idle_staff: "простаивают",
    idle_equipment: "техника",
    expected_duration: "продолжительность",
    description: "работа",
    instructed_by: "поручил",
    instruction_date: "дата",
    instruction_time: "время",
    place: "место",
    instruction_text: "формулировка",
    witnesses: "присутствовали",
    work_started: "уже начато",
    planned_start: "начало",
    estimate_eur: "оценка",
    end_at: "закончилось",
    resumed_at: "возобновлено",
    still_affected: "последствия",
  },
};

export const WORDS: Record<string, { today: string; yesterday: string; yes: string; no: string; people: string }> = {
  en: { today: "today", yesterday: "yesterday", yes: "yes", no: "no", people: "people" },
  de: { today: "heute", yesterday: "gestern", yes: "ja", no: "nein", people: "Personen" },
  ru: { today: "сегодня", yesterday: "вчера", yes: "да", no: "нет", people: "чел." },
};
