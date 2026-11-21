// Three weeks of past activity on the demo sites, so the board, the timelines
// and the daily reports look like a company that already works with Klara.
// Added on "Demo zurücksetzen" and on the first start of the memory store, not
// in the test seed. References KL-2026-0031..0041: the case of the live demo
// is then KL-2026-0042, as in the pitch. Letters are built by the real
// templates; ids are stable (seedId), dates are relative to the seed day.
import { createHash } from "node:crypto";
import type { ProjectContext } from "@/lib/db/repo";
import { addWerktage, berlinDay, berlinTime, DEFAULT_HOLIDAY_REGION, subWerktage, demoDay } from "@/lib/deadlines";
import { requireDocType } from "@/lib/doctypes";
import { buildBody, toMarkdown } from "@/lib/documents/build";
import { dateDe } from "@/lib/documents/templates/kit";
import { IDS, seedId } from "@/lib/ids";
import { REPLY_KIND_DE, ROLE_GENITIVE_DE } from "@/lib/labels";
import { fallbackBody, mailSubject } from "@/lib/mail/compose";
import { reportReference } from "@/lib/reports/reference";
import { evaluateCase } from "@/lib/rules";
import type { AppEvent, Case, CaseStatus, DocumentVersion, EmailIn, EmailOut, Evidence, ReplyKind, Sphere } from "@/lib/types";
import type { SeedData } from "./store";

type Line = ["user" | "klara", string, string];

type Spec = {
  n: number;
  project: string;
  team: string | null;
  doc: string;
  status: CaseStatus;
  sphere: Sphere | null;
  at: Date;
  facts: Record<string, unknown>;
  confidence?: number;
  parent?: number;
  mehrkosten?: number;
  flags?: string[];
  transcript?: { lang: string; kind: "call" | "chat"; lines: Line[] };
  weather?: string;
  /** Validated by the Bauleiter (without sending: status validiert). */
  validated?: Date;
  sent?: Date;
  reply?: { at: Date; from: string; kind: ReplyKind; text: string; quote: string; summary_de: string; requested_items?: string[] };
};

const REJECTION_HINT_DE = "Eine Zurückweisung macht die Behinderungsanzeige nicht unwirksam. Vorschlag: Stellungnahme mit Nachweisen.";

export function withDemoHistory(seed: SeedData, now: Date): SeedData {
  const region = DEFAULT_HOLIDAY_REGION;
  const today = demoDay(now, region);
  const wt = (n: number) => (n >= 0 ? addWerktage(today, n, region) : subWerktage(today, -n, region));
  const at = (d: number, hhmm: string) => {
    const [hh, mm] = hhmm.split(":").map(Number);
    return berlinTime(wt(d), hh, mm);
  };
  const plus = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);
  let k = 0;
  const nid = () => seedId(++k);
  const ref = (n: number) => `KL-2026-${String(n).padStart(4, "0")}`;

  const ctxOf = (projectId: string): ProjectContext => {
    const schedule = seed.schedule_item!.filter((s) => s.project_id === projectId);
    return {
      project: seed.project!.find((p) => p.id === projectId)!,
      company: seed.company![0],
      contacts: seed.contact!.filter((c) => c.project_id === projectId),
      trades: seed.trade!.filter((t) => t.project_id === projectId),
      teams: seed.team!.filter((t) => t.project_id === projectId),
      users: seed.app_user!,
      schedule,
      progress: seed.progress_entry!.filter((p) => schedule.some((s) => s.id === p.schedule_item_id)),
    };
  };
  const contact = (id: string) => seed.contact!.find((c) => c.id === id)!;
  const bauleiter = seed.app_user!.find((u) => u.id === IDS.userBauleiter)!;

  const P1 = IDS.project;
  const P2 = IDS.projectRiem;
  const P3 = IDS.projectSchwabing;

  const specs: Spec[] = [
    // ── B Wohnanlage Riem, Haus 2 (the demo site) ───────────────────
    {
      n: 31,
      project: P1,
      team: IDS.teamEstrich,
      doc: "mehrkostenanzeige",
      status: "abgeschlossen",
      sphere: null,
      at: at(-14, "07:52"),
      confidence: 0.93,
      facts: {
        instruction_date: wt(-14),
        instructed_by: "Thomas Weber (Architekt)",
        description: "Herstellen von 6 zusätzlichen Deckendurchbrüchen für Lüftungsleitungen im 1.OG, Achsen D–F",
        work_started: false,
        planned_start: wt(-12),
        estimate_eur: 1850,
        verbal: true,
      },
      transcript: {
        lang: "ru",
        kind: "call",
        lines: [
          ["user", "Архитектор Вебер сказал устно: на первом этаже нужно ещё шесть проёмов в перекрытии под вентиляцию, оси D–F.", "Architekt Weber hat mündlich gesagt: Im 1.OG werden noch sechs Deckendurchbrüche für die Lüftung gebraucht, Achsen D bis F."],
          ["klara", "Вы уже начали эту дополнительную работу?", "Haben Sie mit dieser Zusatzleistung schon begonnen?"],
          ["user", "Нет, ещё не начали, планируем послезавтра. По деньгам примерно тысяча восемьсот пятьдесят.", "Nein, noch nicht, wir planen übermorgen. Vom Geld her etwa 1.850."],
          ["klara", "Подытожу: шесть дополнительных проёмов, 1-й этаж, оси D–F, указание архитектора Вебера, начало послезавтра, около 1 850 евро. Всё верно?", "Ich fasse zusammen: sechs zusätzliche Deckendurchbrüche, 1.OG, Achsen D–F, angeordnet von Architekt Weber, Beginn übermorgen, ca. 1.850 €. Stimmt das so?"],
          ["user", "Да, верно.", "Ja, richtig."],
        ],
      },
      sent: at(-14, "11:20"),
      reply: {
        at: at(-12, "09:05"),
        from: IDS.contactBauherr,
        kind: "acceptance",
        text: "Sehr geehrte Damen und Herren,\n\nwir bestätigen den Eingang Ihrer Anzeige und sind mit der Ausführung einverstanden. Das Nachtragsangebot erwarten wir bis Ende der Woche.\n\nMit freundlichen Grüßen\nDr. Petra Lang",
        quote: "Wir bestätigen den Eingang Ihrer Anzeige und sind mit der Ausführung einverstanden.",
        summary_de: "Der Bauherr ist mit der Ausführung einverstanden und erwartet das Nachtragsangebot bis Ende der Woche.",
      },
    },
    {
      n: 32,
      project: P1,
      team: IDS.teamEstrich,
      doc: "anordnung_bestaetigung",
      status: "versendet",
      sphere: null,
      at: at(-14, "07:52"),
      confidence: 0.93,
      mehrkosten: 31,
      facts: {
        instruction_date: wt(-14),
        instruction_time: "07:30",
        place: "1.OG, Achsen D–F",
        instructed_by: "Thomas Weber (Architekt)",
        instruction_text: "Im 1.OG sechs zusätzliche Deckendurchbrüche für Lüftungsleitungen herstellen, Achsen D bis F.",
        witnesses: "Sergej Iwanow (Polier)",
        verbal: true,
      },
      sent: at(-14, "11:21"),
    },
    {
      n: 35,
      project: P1,
      team: IDS.teamAusbau,
      doc: "verzug_nu",
      status: "versendet",
      sphere: "own_sub",
      at: at(-8, "08:14"),
      confidence: 0.91,
      flags: ["internal_risk"],
      facts: {
        start_at: at(-8, "07:00").toISOString(),
        area: "2.OG, Flur Achse 4–7",
        cause: "Nowak Trockenbau ist heute nicht erschienen, die Schachtwände im Flur sind nicht geschlossen",
        affected_works: "Spachtel- und Ausbauarbeiten Flur 2.OG",
        remedy_until: wt(-6),
        _trade: "Trockenbau",
        _contact_id: IDS.contactTrockenbau,
      },
      transcript: {
        lang: "pl",
        kind: "chat",
        lines: [
          ["user", "Ekipa od suchej zabudowy dzisiaj w ogóle nie przyszła. Szachty na korytarzu na drugim piętrze dalej otwarte.", "Die Trockenbau-Kolonne ist heute gar nicht gekommen. Die Schächte im Flur im 2.OG sind immer noch offen."],
          ["klara", "To podwykonawca Nowak Trockenbau GmbH. Przygotuję wezwanie do usunięcia, bez zgłoszenia do inwestora. Od której godziny?", "Das ist der Nachunternehmer Nowak Trockenbau GmbH. Ich bereite eine Abhilfeaufforderung vor, keine Anzeige an den Bauherrn. Seit wann?"],
          ["user", "Od siódmej, nikogo nie ma.", "Seit sieben, niemand ist da."],
          ["klara", "Podsumuję: korytarz 2. piętro, oś 4–7, brak ekipy Nowak od 7:00, termin usunięcia za dwa dni robocze. Zgadza się?", "Ich fasse zusammen: Flur 2.OG, Achse 4–7, Kolonne von Nowak fehlt seit 7:00, Frist zur Abhilfe in zwei Werktagen. Stimmt das so?"],
          ["user", "Tak.", "Ja."],
        ],
      },
      sent: at(-8, "10:05"),
    },

    // ── A Neubau Bürogebäude Schwabing ──────────────────────────────
    {
      n: 33,
      project: P2,
      team: IDS.teamRohbau,
      doc: "behinderungsanzeige",
      status: "versendet",
      sphere: "weather",
      at: at(-11, "07:41"),
      confidence: 0.9,
      flags: ["no_cost_reservation"],
      facts: {
        start_at: at(-11, "07:00").toISOString(),
        area: "Bauteil B, 3.OG",
        cause: "Sturm mit Böen über 60 km/h, der Turmdrehkran ist außer Betrieb",
        affected_works: "Schalung und Bewehrung der Decke über 3.OG",
        idle_staff: 6,
        expected_duration: "1 Arbeitstag",
        _cost_reservation: false,
        _weather: { summary_de: "Sturm, Böen bis 74 km/h, 6 bis 9 °C, Niederschlag 4,2 mm", unusual: true },
      },
      weather: "Sturm, Böen bis 74 km/h, 6 bis 9 °C, Niederschlag 4,2 mm",
      transcript: {
        lang: "tr",
        kind: "call",
        lines: [
          ["user", "Fırtına var, vinç sabahtan beri çalışmıyor. Üçüncü katta altı kişi bekliyor.", "Es ist Sturm, der Kran läuft seit heute Morgen nicht. Im 3.OG warten sechs Leute."],
          ["klara", "Bu muhtemelen ne kadar sürecek?", "Wie lange wird das voraussichtlich dauern?"],
          ["user", "Bugün bütün gün, yarın rüzgar azalıyor.", "Heute den ganzen Tag, morgen lässt der Wind nach."],
          ["klara", "Özetliyorum: fırtına, vinç çalışmıyor, 3. kat, saat 7'den beri altı kişi bekliyor, yaklaşık bir iş günü. Doğru mu?", "Ich fasse zusammen: Sturm, Kran außer Betrieb, 3.OG, sechs Leute warten seit 7 Uhr, etwa ein Arbeitstag. Stimmt das so?"],
          ["user", "Evet, doğru.", "Ja, richtig."],
        ],
      },
      sent: at(-11, "10:12"),
    },
    {
      n: 36,
      project: P2,
      team: IDS.teamFassade,
      doc: "behinderungsanzeige",
      status: "beantwortet",
      sphere: "client",
      at: at(-7, "07:36"),
      confidence: 0.95,
      facts: {
        start_at: at(-7, "07:00").toISOString(),
        area: "Bauteil B, Nordseite, 1.–3.OG",
        cause: "Die Fenster der Nordseite sind nicht eingebaut; ohne Fenster keine Laibungsdämmung und kein WDVS-Anschluss",
        affected_works: "WDVS Nordseite",
        idle_staff: 4,
        expected_duration: "ca. 5 Arbeitstage",
        _trade: "Fenster",
        _cost_reservation: true,
      },
      transcript: {
        lang: "en",
        kind: "call",
        lines: [
          ["user", "Morning. The windows on the north side still aren't in, so we can't start the insulation there. Four of my lads have been standing around since seven.", "Guten Morgen. Die Fenster auf der Nordseite sind immer noch nicht drin, deshalb können wir dort nicht mit der Dämmung anfangen. Vier meiner Leute stehen seit sieben herum."],
          ["klara", "How long will that probably last?", "Wie lange wird das voraussichtlich dauern?"],
          ["user", "The window fitters say Monday at the earliest, so about a week.", "Die Fensterbauer sagen frühestens Montag, also etwa eine Woche."],
          ["klara", "Let me sum up: north side, floors 1 to 3, windows missing, ETICS can't start, four people idle since 7:00, about 5 working days. Is that right?", "Ich fasse zusammen: Nordseite, 1. bis 3.OG, Fenster fehlen, WDVS kann nicht beginnen, vier Leute ohne Einsatz seit 7:00, ca. 5 Arbeitstage. Stimmt das so?"],
          ["user", "Yes, that's right.", "Ja, das stimmt."],
        ],
      },
      sent: at(-7, "09:44"),
      reply: {
        at: at(-5, "14:12"),
        from: IDS.contactRiemBauherr,
        kind: "rejection",
        text: "Sehr geehrte Damen und Herren,\n\nwir weisen Ihre Behinderungsanzeige zurück. Die Fenstermontage ist laut Terminplan erst bis Ende dieser Woche geschuldet.\n\nMit freundlichen Grüßen\nStefan Maier\nSchwabing Office Campus GmbH",
        quote: "Die Fenstermontage ist laut Terminplan erst bis Ende dieser Woche geschuldet.",
        summary_de: "Der Bauherr weist die Anzeige zurück: Die Fenster seien erst Ende der Woche geschuldet.",
      },
    },
    {
      n: 37,
      project: P2,
      team: null,
      doc: "stellungnahme_zurueckweisung",
      status: "versendet",
      sphere: "client",
      at: at(-5, "14:13"),
      parent: 36,
      facts: {
        reply_date: wt(-5),
        reply_quote: "Die Fenstermontage ist laut Terminplan erst bis Ende dieser Woche geschuldet.",
        orig_reference: ref(36),
        orig_date: wt(-7),
        evidence_bullets: [
          `Beginn der Behinderung: ${dateDe(wt(-7))}, 07:00 Uhr, Bereich Bauteil B, Nordseite, 1.–3.OG`,
          "Ursache laut Meldung von der Baustelle: Die Fenster der Nordseite sind nicht eingebaut",
          "Betroffen: WDVS Nordseite; 4 Arbeitskräfte ohne Einsatz",
          `Laut Bauzeitenplan war „Fenstermontage 1.–3.OG“ in Bauteil B, Nordseite bis ${dateDe(wt(-4))} abzuschließen; der WDVS-Beginn war für ${dateDe(wt(-4))} vorgesehen`,
          `Meldung durch Liam O'Connor am ${dateDe(wt(-7))}, 07:36 Uhr; Gesprächsprotokoll mit Zeitstempeln liegt vor`,
        ],
        _hint_de: REJECTION_HINT_DE,
        _trade: "Fenster",
      },
      validated: at(-4, "09:50"),
      sent: at(-4, "10:31"),
    },
    {
      n: 40,
      project: P2,
      team: IDS.teamFassade,
      doc: "behinderung_ende",
      status: "bereit",
      sphere: "client",
      at: at(-1, "16:05"),
      confidence: 0.92,
      parent: 36,
      facts: {
        end_at: at(-1, "07:00").toISOString(),
        resumed_at: at(-1, "07:30").toISOString(),
        still_affected: "WDVS Nordseite: Rückstand wird mit Samstagsarbeit bis Ende nächster Woche aufgeholt",
        _trade: "Fenster",
      },
      transcript: {
        lang: "en",
        kind: "chat",
        lines: [
          ["user", "Windows on the north side are finally in. We started the insulation again this morning at half seven.", "Die Fenster auf der Nordseite sind endlich drin. Wir haben heute früh um halb acht wieder mit der Dämmung angefangen."],
          ["klara", "Good. Is anything still affected by the delay?", "Gut. Wirkt sich die Verzögerung noch auf etwas aus?"],
          ["user", "We'll catch up the lost week by working Saturdays until the end of next week.", "Den Rückstand holen wir mit Samstagsarbeit bis Ende nächster Woche auf."],
          ["klara", "Let me sum up: hindrance ended today 7:00, work resumed 7:30, the north side catches up by working Saturdays. Is that right?", "Ich fasse zusammen: Behinderung heute 7:00 beendet, Wiederaufnahme 7:30, die Nordseite holt den Rückstand mit Samstagsarbeit auf. Stimmt das so?"],
          ["user", "Yep.", "Ja."],
        ],
      },
    },

    // ── C Schule Pasing (BGB) ───────────────────────────────────────
    {
      n: 34,
      project: P3,
      team: IDS.teamAbbruch,
      doc: "mehrkostenanzeige",
      status: "abgeschlossen",
      sphere: null,
      at: at(-10, "13:18"),
      confidence: 0.88,
      facts: {
        instruction_date: wt(-10),
        instructed_by: "Dr. Claudia Ritter (Bauherr)",
        description: "Fußbodenheizung mit Heizestrich im Lehrerzimmer 2.OG statt Belag auf dem Bestandsestrich",
        work_started: false,
        planned_start: wt(-3),
        estimate_eur: 2400,
        verbal: true,
      },
      transcript: {
        lang: "de",
        kind: "call",
        lines: [
          ["user", "Frau Dr. Ritter war heute da und will im Lehrerzimmer jetzt doch eine Fußbodenheizung.", "Frau Dr. Ritter war heute da und will im Lehrerzimmer jetzt doch eine Fußbodenheizung."],
          ["klara", "Haben Sie mit dieser Zusatzleistung schon begonnen?", "Haben Sie mit dieser Zusatzleistung schon begonnen?"],
          ["user", "Nein, frühestens nächste Woche, wenn der Rückbau durch ist. Kosten so um die 2.400.", "Nein, frühestens nächste Woche, wenn der Rückbau durch ist. Kosten so um die 2.400."],
          ["klara", "Ich fasse zusammen: Fußbodenheizung im Lehrerzimmer 2.OG, angeordnet von Dr. Ritter, noch nicht begonnen, ca. 2.400 € netto. Stimmt das so?", "Ich fasse zusammen: Fußbodenheizung im Lehrerzimmer 2.OG, angeordnet von Dr. Ritter, noch nicht begonnen, ca. 2.400 € netto. Stimmt das so?"],
          ["user", "Ja, passt.", "Ja, passt."],
        ],
      },
      sent: at(-10, "15:40"),
      reply: {
        at: at(-8, "18:22"),
        from: IDS.contactSchwBauherr,
        kind: "acceptance",
        text: "Guten Abend,\n\nwir sind einverstanden, bitte schicken Sie uns das Angebot für die Fußbodenheizung.\n\nViele Grüße\nClaudia Ritter",
        quote: "Wir sind einverstanden, bitte schicken Sie uns das Angebot für die Fußbodenheizung.",
        summary_de: "Der Schulträger ist einverstanden und bittet um das Angebot.",
      },
    },
    {
      n: 38,
      project: P3,
      team: IDS.teamInnenausbau,
      doc: "behinderungsanzeige",
      status: "beantwortet",
      sphere: "client",
      at: at(-4, "07:47"),
      confidence: 0.94,
      facts: {
        start_at: at(-4, "07:00").toISOString(),
        area: "2.OG, WC-Anlagen",
        cause: "Die Elektro-Altinstallation in den WC-Anlagen ist nicht zurückgebaut, die Leitungen liegen noch offen in den Wänden",
        affected_works: "GK-Vorsatzschalen und Installationswände",
        idle_staff: 3,
        expected_duration: "ca. 3 Arbeitstage",
        _trade: "Elektro",
        _cost_reservation: true,
      },
      transcript: {
        lang: "ro",
        kind: "call",
        lines: [
          ["user", "Electricienii n-au scos instalația veche din toalete, firele sunt încă în pereți. Nu putem monta pereții de rigips. Trei oameni așteaptă de la șapte.", "Die Elektriker haben die alte Installation in den WC-Anlagen nicht ausgebaut, die Leitungen sind noch in den Wänden. Wir können die Gipskartonwände nicht montieren. Drei Leute warten seit sieben."],
          ["klara", "Cât va dura probabil?", "Wie lange wird das voraussichtlich dauern?"],
          ["user", "Cam trei zile, zic ei.", "Etwa drei Tage, sagen sie."],
          ["klara", "Rezum: etajul 2, toaletele, instalația electrică veche nu e demontată, trei oameni fără lucru de la 7:00, cam 3 zile lucrătoare. E corect?", "Ich fasse zusammen: 2.OG, WC-Anlagen, Elektro-Altinstallation nicht zurückgebaut, drei Leute ohne Einsatz seit 7:00, ca. 3 Arbeitstage. Stimmt das so?"],
          ["user", "Da, corect.", "Ja, richtig."],
        ],
      },
      sent: at(-4, "10:02"),
      reply: {
        at: at(-3, "11:34"),
        from: IDS.contactSchwBauherr,
        kind: "request_info",
        text: "Sehr geehrte Damen und Herren,\n\nbitte teilen Sie uns mit, welche Leitungen konkret betroffen sind und ob beide WC-Anlagen gleichermaßen betroffen sind. Wir klären das dann mit dem Elektriker.\n\nMit freundlichen Grüßen\nDr. Claudia Ritter",
        quote: "Bitte teilen Sie uns mit, welche Leitungen konkret betroffen sind und ob beide WC-Anlagen gleichermaßen betroffen sind.",
        summary_de: "Der Schulträger fragt, welche Leitungen betroffen sind und ob beide WC-Anlagen betroffen sind.",
        requested_items: ["Welche Leitungen konkret betroffen sind", "Ob beide WC-Anlagen gleichermaßen betroffen sind"],
      },
    },
    {
      n: 39,
      project: P3,
      team: IDS.teamInnenausbau,
      doc: "ergaenzung",
      status: "bereit",
      sphere: "client",
      at: at(-3, "11:35"),
      parent: 38,
      facts: {
        reply_date: wt(-3),
        orig_reference: ref(38),
        orig_date: wt(-4),
        requested_items: ["Welche Leitungen konkret betroffen sind", "Ob beide WC-Anlagen gleichermaßen betroffen sind"],
        answers:
          "Betroffen sind die alten Steig- und Verteilerleitungen der Elektroinstallation hinter den WC-Wänden sowie die Zuleitung der Lüfter. Beide WC-Anlagen sind gleichermaßen betroffen.",
        _hint_de: "Der Auftraggeber bittet um ergänzende Angaben. Klara hat Andrei Popescu im Team-Chat danach gefragt; die Antwort kommt direkt in das Schreiben.",
        _reply_quote: "Bitte teilen Sie uns mit, welche Leitungen konkret betroffen sind und ob beide WC-Anlagen gleichermaßen betroffen sind.",
        _reply_date: wt(-3),
      },
      transcript: {
        lang: "ro",
        kind: "chat",
        lines: [
          ["klara", "Șeful de șantier mai are nevoie de o informație. „Beneficiarul întreabă ce conducte sunt afectate și dacă ambele toalete sunt afectate.” Ce să răspund?", "Die Bauleitung braucht noch eine Angabe. „Der Auftraggeber fragt, welche Leitungen betroffen sind und ob beide WC-Anlagen betroffen sind.“ Was soll ich antworten?"],
          ["user", "Coloanele vechi și distribuția din spatele pereților din toalete, plus alimentarea ventilatoarelor. Ambele toalete la fel.", "Die alten Steig- und Verteilerleitungen hinter den WC-Wänden, dazu die Zuleitung der Lüfter. Beide WC-Anlagen gleich."],
          ["klara", "Rezum răspunsul pentru beneficiar. E corect?", "Ich fasse die Antwort für den Auftraggeber zusammen. Stimmt das so?"],
          ["user", "Da.", "Ja."],
        ],
      },
    },
    {
      n: 41,
      project: P3,
      team: IDS.teamAbbruch,
      doc: "meldung",
      status: "bereit",
      sphere: null,
      at: at(-1, "15:12"),
      confidence: 0.45,
      facts: {
        report: "Im Treppenhaus 2.OG ist heute Wasser durch die Decke gekommen, keiner weiß woher.",
        area: "Treppenhaus, 2.OG",
        impact: "Arbeiten laufen weiter, Bereich abgesperrt",
      },
      transcript: {
        lang: "de",
        kind: "call",
        lines: [
          ["user", "Da ist heute irgendwas komisch im Treppenhaus.", "Da ist heute irgendwas komisch im Treppenhaus."],
          ["klara", "Entschuldigung, das habe ich nicht genau verstanden. Was ist auf der Baustelle passiert, und wo genau?", "Entschuldigung, das habe ich nicht genau verstanden. Was ist auf der Baustelle passiert, und wo genau?"],
          ["user", "Im Treppenhaus 2.OG ist Wasser durch die Decke gekommen, keiner weiß woher.", "Im Treppenhaus 2.OG ist Wasser durch die Decke gekommen, keiner weiß woher."],
          ["klara", "Ich lege das als Meldung zur Prüfung für die Bauleitung an. Kann Ihre Kolonne weiterarbeiten? Wie viele Leute sind betroffen?", "Ich lege das als Meldung zur Prüfung für die Bauleitung an. Kann Ihre Kolonne weiterarbeiten? Wie viele Leute sind betroffen?"],
          ["user", "Wir arbeiten weiter, den Bereich haben wir abgesperrt.", "Wir arbeiten weiter, den Bereich haben wir abgesperrt."],
          ["klara", "Ich fasse zusammen: Wasser durch die Decke im Treppenhaus 2.OG, Ursache unbekannt, Bereich abgesperrt, Arbeiten laufen weiter. Stimmt das so?", "Ich fasse zusammen: Wasser durch die Decke im Treppenhaus 2.OG, Ursache unbekannt, Bereich abgesperrt, Arbeiten laufen weiter. Stimmt das so?"],
          ["user", "Ja.", "Ja."],
        ],
      },
    },
  ];

  const cases: Case[] = [];
  const versions: DocumentVersion[] = [];
  const evidence: Evidence[] = [];
  const emailsOut: EmailOut[] = [];
  const emailsIn: EmailIn[] = [];
  const events: AppEvent[] = [];
  const byN = new Map<number, Case>();
  const event = (c: Case, kind: string, when: Date, payload: Record<string, unknown> = {}) =>
    events.push({ id: nid(), project_id: c.project_id, case_id: c.id, kind, payload: { reference: c.reference, ...payload }, created_at: when.toISOString() });

  // Parents and Mehrkosten first, so the follow-ups can refer to them.
  for (const s of [...specs].sort((a, b) => Number(!!a.parent || !!a.mehrkosten) - Number(!!b.parent || !!b.mehrkosten))) {
    const ctx = ctxOf(s.project);
    const def = requireDocType(s.doc);
    const facts: Record<string, unknown> = {
      ...s.facts,
      ...(s.confidence !== undefined ? { _confidence: s.confidence } : {}),
      ...(s.mehrkosten ? { _mehrkosten_case_id: byN.get(s.mehrkosten)!.id } : {}),
    };
    const ev = evaluateCase(
      {
        def,
        facts,
        sphere: s.sphere,
        confidence: s.confidence ?? null,
        now: s.at,
        subcontractorContactId: typeof facts._contact_id === "string" ? facts._contact_id : null,
      },
      ctx,
    );
    const lead = s.team ? ctx.users.find((u) => u.id === ctx.teams.find((t) => t.id === s.team)?.lead_user_id) ?? null : null;
    let checks = ev.checks;
    if (s.reply) {
      const sender = contact(s.reply.from);
      checks = checks.map((x) =>
        x.id === "channel" ? { ...x, light: "green" as const, reason_de: `Zugang belegt: Antwort ${ROLE_GENITIVE_DE[sender.role]} vom ${dateDe(berlinDay(s.reply!.at))}` } : x,
      );
    }
    const c: Case = {
      id: nid(),
      project_id: s.project,
      team_id: s.team,
      conversation_id: null,
      doc_type: s.doc,
      status: s.status,
      sphere: s.sphere,
      facts: { ...facts, ...(s.status !== "entwurf" && s.transcript ? { _confirmed_at: plus(s.at, 3).toISOString() } : {}) },
      missing_fields: ev.missing_fields,
      checks,
      deadline_at: ev.deadline.due_at,
      deadline_rule: ev.deadline_rule,
      parent_case_id: s.parent ? byN.get(s.parent)!.id : null,
      reference: ref(s.n),
      created_by: lead?.id ?? null,
      asked_fields: [],
      declined_fields: [],
      flags: [...new Set([...(s.flags ?? []), ...ev.flags])],
      created_at: s.at.toISOString(),
      updated_at: (s.reply?.at ?? s.sent ?? s.validated ?? plus(s.at, 3)).toISOString(),
    };
    byN.set(s.n, c);
    cases.push(c);
    event(c, "case_created", s.at, { doc_type: c.doc_type });

    if (s.transcript) {
      const turns = s.transcript.lines.map(([role, text, de], i) => ({
        role,
        text,
        text_de: de,
        language: s.transcript!.lang,
        at: new Date(s.at.getTime() - (s.transcript!.lines.length - i) * 35_000).toISOString(),
      }));
      evidence.push({ id: nid(), case_id: c.id, kind: "transcript", ref: null, data: { conversation_id: null, kind: s.transcript.kind, turns }, created_at: plus(s.at, 3).toISOString() });
      event(c, "case_confirmed", plus(s.at, 3), { doc_type: c.doc_type, by: lead?.name ?? null });
    }
    if (s.weather) evidence.push({ id: nid(), case_id: c.id, kind: "weather", ref: "open-meteo", data: { summary_de: s.weather, unusual: true }, created_at: plus(s.at, 3).toISOString() });

    // The letter, built by the real template on the day it was written.
    const written = plus(s.at, 3);
    const body = buildBody(
      {
        c,
        letterDate: berlinDay(written),
        related: { parent: c.parent_case_id ? cases.find((x) => x.id === c.parent_case_id) ?? null : null, mehrkosten: s.mehrkosten ? byN.get(s.mehrkosten) ?? null : null },
      },
      ctx,
    );
    const md = toMarkdown(body);
    const vid = nid();
    const validatedAt = s.sent ? plus(s.sent, -20) : (s.validated ?? null);
    const v: DocumentVersion = {
      id: vid,
      case_id: c.id,
      version: 1,
      body,
      body_md: md,
      pdf_url: `/api/documents/${vid}/pdf`,
      docx_url: `/api/documents/${vid}/docx`,
      sha256: createHash("sha256").update(md, "utf8").digest("hex"),
      addressee_contact_id: ev.recipient.to?.id ?? null,
      tone: null,
      created_at: written.toISOString(),
      validated_by: validatedAt ? bauleiter.id : null,
      validated_at: validatedAt?.toISOString() ?? null,
      sent_at: s.sent?.toISOString() ?? null,
      delivery_status: s.sent ? "versendet" : null,
      immutable: !!s.sent,
    };
    versions.push(v);
    event(c, "document_generated", plus(written, 0.001), { version: 1, sha256: v.sha256 });
    if (validatedAt) event(c, "case_validated", validatedAt, { version: 1, by: bauleiter.name });

    if (s.sent && ev.recipient.to) {
      const to = ev.recipient.to;
      const subject = mailSubject(c, ctx.project.name);
      const messageId = `<klara-${vid.slice(-8)}@muster-bau.example>`;
      const mail: EmailOut = {
        id: nid(),
        case_id: c.id,
        document_version_id: vid,
        to: [to.email],
        cc: ev.recipient.cc.map((x) => x.email),
        subject,
        body: fallbackBody(c, body, ctx),
        message_id: messageId,
        sent_at: s.sent.toISOString(),
        status: "versendet",
      };
      emailsOut.push(mail);
      evidence.push({
        id: nid(),
        case_id: c.id,
        kind: "email",
        ref: mail.id,
        data: { direction: "out", to: mail.to, subject, summary_de: `E-Mail an ${to.name} (${to.organisation}) versendet` },
        created_at: s.sent.toISOString(),
      });
      event(c, "email_sent", s.sent, { subject, by: bauleiter.name, simulated: false, summary_de: `An ${to.name}, ${to.organisation}` });

      if (s.reply) {
        const r = s.reply;
        const sender = contact(r.from);
        const reply: EmailIn = {
          id: nid(),
          project_id: c.project_id,
          case_id: c.id,
          from_addr: sender.email,
          subject: `AW: ${subject}`,
          body_text: r.text,
          in_reply_to: messageId,
          message_id: `<reply-${vid.slice(-8)}@mail.example>`,
          received_at: r.at.toISOString(),
          classification: { kind: r.kind, summary_de: r.summary_de, key_points: [r.quote], requested_items: r.requested_items ?? [], quote: r.quote, source: "live" },
          raw: null,
        };
        emailsIn.push(reply);
        const who = ROLE_GENITIVE_DE[sender.role];
        evidence.push({
          id: nid(),
          case_id: c.id,
          kind: "email",
          ref: reply.id,
          data: { direction: "in", from: sender.email, subject: reply.subject, kind: r.kind, quote: r.quote, summary_de: `Antwort ${who}: ${REPLY_KIND_DE[r.kind]}. ${r.summary_de}` },
          created_at: r.at.toISOString(),
        });
        event(c, "reply_received", r.at, { from: sender.email, subject: reply.subject, kind: r.kind, email_in_id: reply.id, summary_de: `Antwort ${who}: ${REPLY_KIND_DE[r.kind]} – „${r.quote}“` });
        if (r.kind === "acceptance") event(c, "case_closed", plus(r.at, 0.001), { summary_de: `${REPLY_KIND_DE[r.kind]}: ${r.summary_de}` });
      }
    }
  }
  // Follow-ups proposed after their reply, and the reply id on the follow-up.
  for (const s of specs.filter((x) => x.parent && (x.doc === "stellungnahme_zurueckweisung" || x.doc === "ergaenzung"))) {
    const f = byN.get(s.n)!;
    const parent = byN.get(s.parent!)!;
    const reply = emailsIn.find((m) => m.case_id === parent.id);
    if (reply) f.facts = { ...f.facts, _reply_email_id: reply.id };
    events.push({
      id: nid(),
      project_id: parent.project_id,
      case_id: parent.id,
      kind: "followup_proposed",
      payload: { reference: f.reference, doc_type: f.doc_type, case_id: f.id, summary_de: `${requireDocType(f.doc_type).title_de} ${f.reference} vorbereitet` },
      created_at: plus(s.at, 0.002).toISOString(),
    });
  }

  // Bautagesberichte of the last two Werktage (yesterday's of Team Estrich still to validate).
  const reports: { team: string; d: number; staff: string; status: CaseStatus; weather: string }[] = [
    { team: IDS.teamEstrich, d: -2, staff: "1 Polier, 3 Facharbeiter, 1 Helfer", status: "validiert", weather: "Bewölkt, 4 bis 9 °C" },
    { team: IDS.teamEstrich, d: -1, staff: "1 Polier, 3 Facharbeiter, 1 Helfer", status: "bereit", weather: "Leichter Regen, 3 bis 7 °C, Niederschlag 1,8 mm" },
    { team: IDS.teamRohbau, d: -2, staff: "1 Polier, 5 Facharbeiter, 2 Helfer", status: "validiert", weather: "Bewölkt, 4 bis 9 °C" },
    { team: IDS.teamRohbau, d: -1, staff: "1 Polier, 5 Facharbeiter, 2 Helfer", status: "validiert", weather: "Leichter Regen, 3 bis 7 °C, Niederschlag 1,8 mm" },
    { team: IDS.teamFassade, d: -1, staff: "1 Polier, 4 Facharbeiter", status: "validiert", weather: "Leichter Regen, 3 bis 7 °C, Niederschlag 1,8 mm" },
    { team: IDS.teamInnenausbau, d: -1, staff: "1 Polier, 2 Facharbeiter, 1 Helfer", status: "validiert", weather: "Leichter Regen, 3 bis 7 °C, Niederschlag 1,8 mm" },
  ];
  for (const r of reports) {
    const team = seed.team!.find((t) => t.id === r.team)!;
    const ctx = ctxOf(team.project_id);
    const day = wt(r.d);
    const lead = ctx.users.find((u) => u.id === team.lead_user_id) ?? null;
    const items = ctx.schedule.filter((s) => ctx.trades.find((t) => t.id === s.trade_id)?.team_id === team.id);
    const progress = items.flatMap((it) => {
      const row = ctx.progress.find((p) => p.schedule_item_id === it.id && p.date === day);
      const trade = ctx.trades.find((t) => t.id === it.trade_id);
      return row ? [{ label: `${trade?.name ?? it.activity} ${it.area}`.trim(), qty: row.actual_qty, unit: it.unit ?? "", planned: it.planned_per_day }] : [];
    });
    const incidents = cases
      .filter((c) => c.team_id === team.id && c.doc_type !== "anordnung_bestaetigung" && c.doc_type !== "mehrkostenanzeige" && berlinDay(new Date(c.created_at)) === day)
      .map((c) => `${requireDocType(c.doc_type).title_de} ${c.reference}`);
    const facts: Record<string, unknown> = {
      date: day,
      weather: r.weather,
      staff: r.staff,
      work_performed: progress.length ? progress.map((p) => `${p.label}: ${p.qty} ${p.unit}`.trim()) : ["Arbeiten nach Plan"],
      _progress: progress,
      _instructions: [],
      ...(incidents.length ? { incidents: incidents.join("; ") } : {}),
      _incidents: incidents,
      _team_name: team.name,
      _photos: 0,
      _lead_name: lead?.name ?? null,
      _bauleiter_name: bauleiter.name,
    };
    const created = berlinTime(day, 16, 40);
    const ev = evaluateCase({ def: requireDocType("bautagesbericht"), facts, sphere: null, confidence: null, now: created, subcontractorContactId: null }, ctx);
    const c: Case = {
      id: nid(),
      project_id: team.project_id,
      team_id: team.id,
      conversation_id: null,
      doc_type: "bautagesbericht",
      status: r.status,
      sphere: null,
      facts,
      missing_fields: ev.missing_fields,
      checks: ev.checks,
      deadline_at: ev.deadline.due_at,
      deadline_rule: ev.deadline_rule,
      parent_case_id: null,
      reference: reportReference(team, day),
      created_by: lead?.id ?? null,
      asked_fields: [],
      declined_fields: [],
      flags: [],
      created_at: created.toISOString(),
      updated_at: created.toISOString(),
    };
    cases.push(c);
    const body = buildBody({ c, letterDate: day }, ctx);
    const md = toMarkdown(body);
    const vid = nid();
    const validatedAt = r.status === "validiert" ? berlinTime(wt(r.d + 1), 7, 45) : null;
    versions.push({
      id: vid,
      case_id: c.id,
      version: 1,
      body,
      body_md: md,
      pdf_url: `/api/documents/${vid}/pdf`,
      docx_url: `/api/documents/${vid}/docx`,
      sha256: createHash("sha256").update(md, "utf8").digest("hex"),
      addressee_contact_id: null,
      tone: null,
      created_at: created.toISOString(),
      validated_by: validatedAt ? bauleiter.id : null,
      validated_at: validatedAt?.toISOString() ?? null,
      sent_at: null,
      delivery_status: null,
      immutable: false,
    });
    event(c, "case_created", created, { doc_type: "bautagesbericht" });
    event(c, "document_generated", plus(created, 0.001), { version: 1 });
    if (validatedAt) event(c, "case_validated", validatedAt, { version: 1, by: bauleiter.name });
  }

  return {
    ...seed,
    case: [...(seed.case ?? []), ...cases],
    document_version: [...(seed.document_version ?? []), ...versions],
    evidence: [...(seed.evidence ?? []), ...evidence],
    email_out: [...(seed.email_out ?? []), ...emailsOut],
    email_in: [...(seed.email_in ?? []), ...emailsIn],
    event: [...(seed.event ?? []), ...events],
  };
}
