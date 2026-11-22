// Demo history: five earlier meetings (MT-2026-0001 … 0005) on all three sites,
// before MT-2026-0006/0007 (sample.ts). Each one fits the case history
// (demo-history.ts): it links the letters that already existed (KL-…-0031,
// 0032, 0036) and records what later became one (KL-…-0034, 0038). Recorded
// history only: the seed creates no case and changes no date. Pure.
import { berlinTime, DEFAULT_HOLIDAY_REGION, demoDay, subWerktage } from "@/lib/deadlines";
import { IDS } from "@/lib/ids";
import type { Meeting } from "@/lib/types";
import { verifyItems } from "./items";
import { finalizeSegment } from "./language";
import { defaultTitle, emptySteps, isoWeek, sortLanguages, type MeetingItem, type MeetingProtocol, type MeetingType, type Participant, type Segment } from "./model";
import type { RawItem } from "./sample";

/** A segment as said, with the stored German (German stays verbatim). */
const seg = (speaker: string, start: number, end: number, language: string, original: string, german?: string): Segment =>
  finalizeSegment(
    { speaker, start_sec: start, end_sec: end, language: null, text_original: original, text_de: null, confidence: null, notes: [] },
    { language, text_de: german ?? original, confidence: language === "de" ? 0.96 : 0.92 },
  );

/** A history item may point at an existing letter (the link resolves when the case exists). */
type HistoryItem = RawItem & { case_ref?: string; case_doc_type?: string; case_action?: MeetingItem["case_action"] };

type Spec = {
  id: string;
  ref: string;
  project: string;
  type: MeetingType;
  title?: (start: Date) => string;
  /** Werktage before the demo day, and the start time. */
  day: number;
  at: [number, number];
  participants: Participant[];
  segments: Segment[];
  summary: string[];
  items: HistoryItem[];
};

const p = (name: string, role: string, contact_id: string | null = null, email: string | null = null): Participant => ({ name, role, contact_id, email });
const HOFMANN = p("Markus Hofmann", "Bauleiter (Muster Bau GmbH)", null, "m.hofmann@muster-bau.example");

const SPECS: Spec[] = [
  // ── B Wohnanlage Riem: the day after the Anordnung (KL-…-0032) and its Mehrkostenanzeige (KL-…-0031).
  {
    id: IDS.meetingHist1,
    ref: "MT-2026-0001",
    project: IDS.project,
    type: "bauherr",
    day: 13,
    at: [8, 0],
    participants: [
      HOFMANN,
      p("Dr. Petra Lang", "Bauherr (Wohnbau Riem GmbH)", IDS.contactBauherr),
      p("Thomas Weber", "Architekt (Büro Weber Architekten)", IDS.contactArchitekt),
      p("Sergej Iwanow", "Polier Estrich (Muster Bau GmbH)"),
      p("Anna Huber", "Nachunternehmer (Huber Bodenbeläge GmbH & Co. KG)", IDS.contactBodenbelag),
    ],
    segments: [
      seg("Markus Hofmann", 5, 14, "de", "Guten Morgen. Erster Punkt: die Deckendurchbrüche im 1. OG."),
      seg("Thomas Weber", 16, 27, "de", "Die sechs Durchbrüche für die Lüftung in den Achsen D bis F bleiben so, wie gestern angeordnet."),
      seg("Markus Hofmann", 29, 38, "de", "Die Anordnung haben wir schriftlich bestätigt, die Mehrkosten sind angezeigt."),
      seg("Dr. Petra Lang", 40, 47, "de", "Die Mehrkostenanzeige liegt mir vor, wir prüfen sie bis Freitag."),
      seg("Sergej Iwanow", 72, 81, "ru", "Стяжка на втором этаже готова, через неделю по ней можно ходить.", "Der Estrich im 1. OG ist fertig, in einer Woche ist er begehbar."),
      seg("Anna Huber", 84, 93, "de", "Für die Bodenbeläge im 1. OG brauchen wir die CM-Messung, vorher legen wir nichts."),
      seg("Markus Hofmann", 95, 102, "de", "Herr Iwanow, machen Sie bitte am Donnerstag die CM-Messung im 1. OG."),
      seg("Sergej Iwanow", 103, 106, "ru", "Хорошо, в четверг сделаю.", "Gut, mache ich am Donnerstag."),
      seg("Thomas Weber", 131, 138, "de", "Die Ausführungspläne Bodenbelag schicke ich Ihnen bis Mittwoch."),
      seg("Markus Hofmann", 170, 174, "de", "Danke, dann bis nächste Woche."),
    ],
    summary: [
      "Deckendurchbrüche 1. OG (Achsen D–F) bleiben wie angeordnet; Anordnung bestätigt, Mehrkosten angezeigt.",
      "Bauherr prüft die Mehrkostenanzeige bis Freitag.",
      "Estrich 1. OG fertig, in einer Woche begehbar; Bodenbeläge erst nach der CM-Messung.",
      "Ausführungspläne Bodenbelag kommen bis Mittwoch.",
    ],
    items: [
      { kind: "anordnung", text: "Sechs zusätzliche Deckendurchbrüche für Lüftungsleitungen im 1. OG, Achsen D–F.", quote_de: "Die sechs Durchbrüche für die Lüftung in den Achsen D bis F bleiben so, wie gestern angeordnet.", segment: 1, area: "1.OG", case_ref: "KL-2026-0032", case_doc_type: "anordnung_bestaetigung", case_action: "existing" },
      { kind: "mehrkosten", text: "Mehrkosten der zusätzlichen Deckendurchbrüche sind angezeigt.", quote_de: "die Mehrkosten sind angezeigt", segment: 2, area: "1.OG", case_ref: "KL-2026-0031", case_doc_type: "mehrkostenanzeige", case_action: "existing" },
      { kind: "decision", text: "Bodenbeläge im 1. OG erst nach der CM-Messung.", quote_de: "Für die Bodenbeläge im 1. OG brauchen wir die CM-Messung, vorher legen wir nichts.", segment: 5, trade: "Bodenbelag" },
      { kind: "task", text: "CM-Messung Estrich 1. OG", quote_de: "machen Sie bitte am Donnerstag die CM-Messung im 1. OG", segment: 6, owner: "Sergej Iwanow (Polier Estrich)", due: "Donnerstag", trade: "Estrich" },
      { kind: "task", text: "Mehrkostenanzeige Deckendurchbrüche prüfen", quote_de: "wir prüfen sie bis Freitag", segment: 3, owner: "Dr. Petra Lang (Bauherr)", due: "Freitag" },
      { kind: "task", text: "Ausführungspläne Bodenbelag schicken", quote_de: "Die Ausführungspläne Bodenbelag schicke ich Ihnen bis Mittwoch.", segment: 8, owner: "Thomas Weber (Büro Weber Architekten)", due: "Mittwoch", trade: "Bodenbelag" },
    ],
  },

  // ── A Neubau Bürogebäude Schwabing: before the storm (KL-…-0033) and the late windows (KL-…-0036).
  {
    id: IDS.meetingHist2,
    ref: "MT-2026-0002",
    project: IDS.projectRiem,
    type: "bauherr",
    day: 12,
    at: [9, 0],
    participants: [
      HOFMANN,
      p("Stefan Maier", "Bauherr (Schwabing Office Campus GmbH)", IDS.contactRiemBauherr),
      p("Sabine Krämer", "Projektsteuerung (Krämer Projektsteuerung GmbH)", IDS.contactRiemSteuerung),
      p("Mehmet Yılmaz", "Polier Rohbau (Muster Bau GmbH)"),
      p("Liam O'Connor", "Polier Fassade (Muster Bau GmbH)"),
      p("Tobias Schmid", "Nachunternehmer (Gerüstbau Schmid GmbH)", IDS.contactRiemGeruest),
    ],
    segments: [
      seg("Markus Hofmann", 4, 9, "de", "Guten Morgen. Zuerst Rohbau Bauteil B."),
      seg("Mehmet Yılmaz", 11, 20, "tr", "3. kattaki tavan cuma günü betonlanıyor, kalıp hazır.", "Die Decke über dem 3. OG wird am Freitag betoniert, die Schalung steht."),
      seg("Markus Hofmann", 22, 31, "de", "Für Donnerstag ist Sturm angesagt. Bei Böen über 60 km/h steht der Kran."),
      seg("Stefan Maier", 33, 38, "de", "Dann verschiebt sich das Betonieren eben um einen Tag."),
      seg("Markus Hofmann", 39, 46, "de", "Wir dokumentieren den Stillstand und zeigen ihn an, falls es so kommt."),
      seg("Liam O'Connor", 88, 99, "en", "The windows on the north side are still not in. We can't start the insulation around the openings without them.", "Die Fenster auf der Nordseite sind immer noch nicht eingebaut. Ohne sie können wir mit der Dämmung an den Laibungen nicht anfangen."),
      seg("Stefan Maier", 101, 109, "de", "Unser Fensterbauer hat zugesagt: Die Nordseite ist bis Ende nächster Woche fertig."),
      seg("Sabine Krämer", 112, 119, "de", "Die Anschlussdetails Fenster an WDVS schicke ich bis Mittwoch."),
      seg("Tobias Schmid", 121, 126, "de", "Das Gerüst an der Nordseite bauen wir bis Montag um."),
      seg("Markus Hofmann", 129, 136, "de", "Wir halten fest: WDVS Nordseite beginnt nach dem Fenstereinbau."),
    ],
    summary: [
      "Decke über dem 3. OG (Bauteil B) wird Freitag betoniert, die Schalung steht.",
      "Sturmwarnung für Donnerstag: bei Böen über 60 km/h steht der Kran; ein Stillstand wird dokumentiert und angezeigt.",
      "Fenster Nordseite (Fensterbauer des Bauherrn) fehlen noch; Zusage: fertig bis Ende nächster Woche.",
      "WDVS Nordseite beginnt erst nach dem Fenstereinbau; das Gerüst wird bis Montag umgebaut.",
    ],
    items: [
      { kind: "decision", text: "WDVS Nordseite beginnt nach dem Fenstereinbau.", quote_de: "WDVS Nordseite beginnt nach dem Fenstereinbau.", segment: 9, trade: "Fassade" },
      { kind: "termin", text: "Fenster Nordseite (Fensterbauer des Bauherrn): fertig bis Ende nächster Woche.", quote_de: "Die Nordseite ist bis Ende nächster Woche fertig.", segment: 6, trade: "Fenster", area: "Nordseite", case_action: "noop" },
      { kind: "task", text: "Stillstand bei Sturm dokumentieren und anzeigen", quote_de: "Wir dokumentieren den Stillstand und zeigen ihn an, falls es so kommt.", segment: 4, owner: "Markus Hofmann (Bauleiter)", due: "Donnerstag", trade: "Rohbau" },
      { kind: "task", text: "Anschlussdetails Fenster/WDVS schicken", quote_de: "Die Anschlussdetails Fenster an WDVS schicke ich bis Mittwoch.", segment: 7, owner: "Sabine Krämer (Projektsteuerung)", due: "Mittwoch", trade: "Fassade" },
      { kind: "task", text: "Gerüst Nordseite umbauen", quote_de: "Das Gerüst an der Nordseite bauen wir bis Montag um.", segment: 8, owner: "Tobias Schmid (Gerüstbau Schmid)", due: "Montag", trade: "Gerüstbau" },
    ],
  },

  // ── C Schule Pasing: the client orders underfloor heating (→ Mehrkostenanzeige KL-…-0034 the next day).
  {
    id: IDS.meetingHist3,
    ref: "MT-2026-0003",
    project: IDS.projectSchwabing,
    type: "bauherr",
    day: 11,
    at: [10, 0],
    participants: [
      HOFMANN,
      p("Dr. Claudia Ritter", "Bauherr (Bildungswerk Pasing gGmbH)", IDS.contactSchwBauherr),
      p("Katharina Lindner", "Architektin (Lindner Architekten PartGmbB)", IDS.contactSchwArchitekt),
      p("Klaus Becker", "Polier Abbruch (Muster Bau GmbH)"),
      p("Andrei Popescu", "Polier Innenausbau (Muster Bau GmbH)"),
      p("Florian Gruber", "Nachunternehmer (Gruber Haustechnik GmbH)", IDS.contactSchwSanitaer),
    ],
    segments: [
      seg("Markus Hofmann", 6, 12, "de", "Guten Morgen. Stand Abbruch im 2. OG, Herr Becker."),
      seg("Klaus Becker", 14, 24, "de", "Der Rückbau im 2. OG ist bis auf die WC-Anlagen durch, Schadstoffe waren keine drin."),
      seg("Dr. Claudia Ritter", 41, 53, "de", "Im Lehrerzimmer im 2. OG wollen wir statt des Belags auf dem alten Estrich eine Fußbodenheizung mit Heizestrich."),
      seg("Markus Hofmann", 55, 62, "de", "Das ist eine geänderte Leistung. Die Mehrkosten zeigen wir Ihnen vor Beginn an."),
      seg("Dr. Claudia Ritter", 63, 67, "de", "Einverstanden, schicken Sie uns das Angebot."),
      seg("Florian Gruber", 80, 88, "de", "Für die Fußbodenheizung brauche ich die Heizlastberechnung bis Montag."),
      seg("Katharina Lindner", 90, 95, "de", "Die Heizlastberechnung schicke ich Herrn Gruber bis Montag."),
      seg("Andrei Popescu", 118, 127, "ro", "Pereții de gips-carton din sălile de clasă de la etajul 1 îi terminăm până joi.", "Die Trockenbauwände in den Klassenzimmern im 1. OG sind bis Donnerstag fertig."),
      seg("Markus Hofmann", 150, 154, "de", "Gut. Nächster Termin in einer Woche."),
    ],
    summary: [
      "Rückbau 2. OG bis auf die WC-Anlagen abgeschlossen, keine Schadstoffe.",
      "Bauherr ordnet im Lehrerzimmer 2. OG eine Fußbodenheizung mit Heizestrich statt Belag an; die Mehrkosten werden vor Beginn angezeigt.",
      "Heizlastberechnung kommt bis Montag an Gruber Haustechnik.",
      "Trockenbauwände der Klassenzimmer im 1. OG bis Donnerstag fertig.",
    ],
    items: [
      { kind: "anordnung", text: "Lehrerzimmer 2. OG: Fußbodenheizung mit Heizestrich statt Belag auf dem Bestandsestrich.", quote_de: "Im Lehrerzimmer im 2. OG wollen wir statt des Belags auf dem alten Estrich eine Fußbodenheizung mit Heizestrich.", segment: 2, area: "2.OG" },
      { kind: "mehrkosten", text: "Mehrkosten der Fußbodenheizung im Lehrerzimmer vor Beginn anzeigen.", quote_de: "Die Mehrkosten zeigen wir Ihnen vor Beginn an.", segment: 3, area: "2.OG", case_ref: "KL-2026-0034", case_doc_type: "mehrkostenanzeige" },
      { kind: "decision", text: "Bauherr ist einverstanden; das Angebot folgt.", quote_de: "Einverstanden, schicken Sie uns das Angebot.", segment: 4 },
      { kind: "task", text: "Heizlastberechnung an Gruber Haustechnik schicken", quote_de: "Die Heizlastberechnung schicke ich Herrn Gruber bis Montag.", segment: 6, owner: "Katharina Lindner (Lindner Architekten)", due: "Montag", trade: "Sanitär" },
      { kind: "task", text: "Angebot Fußbodenheizung an den Bauherrn", quote_de: "schicken Sie uns das Angebot", segment: 4, owner: "Markus Hofmann (Bauleiter)", due: "Freitag" },
    ],
  },

  // ── C Schule Pasing: the WC wiring is not removed yet (→ Behinderungsanzeige KL-…-0038 four days later).
  {
    id: IDS.meetingHist4,
    ref: "MT-2026-0004",
    project: IDS.projectSchwabing,
    type: "nu_koordination",
    title: (start) => `Koordination Haustechnik und Maler KW ${isoWeek(start)}`,
    day: 8,
    at: [13, 0],
    participants: [
      HOFMANN,
      p("Florian Gruber", "Nachunternehmer (Gruber Haustechnik GmbH)", IDS.contactSchwSanitaer),
      p("Elif Demir", "Nachunternehmer (Demir Malerbetrieb e. K.)", IDS.contactSchwMaler),
      p("Andrei Popescu", "Polier Innenausbau (Muster Bau GmbH)"),
      p("Klaus Becker", "Polier Abbruch (Muster Bau GmbH)"),
    ],
    segments: [
      seg("Markus Hofmann", 3, 9, "de", "Thema heute: WC-Anlagen im 2. OG und die Maler."),
      seg("Florian Gruber", 11, 21, "de", "Die Vorwandinstallation in den WC-Anlagen können wir erst setzen, wenn die alte Elektroinstallation raus ist."),
      seg("Klaus Becker", 23, 33, "de", "Die Elektro-Altinstallation in den WCs baut der Elektriker des Bauherrn zurück, das ist noch nicht passiert."),
      seg("Markus Hofmann", 35, 41, "de", "Ich frage beim Bauherrn nach, bis wann der Elektriker das erledigt."),
      seg("Andrei Popescu", 43, 50, "ro", "Dacă WC-urile nu sunt libere până marți, echipa mea stă.", "Wenn die WCs bis Dienstag nicht frei sind, steht mein Team."),
      seg("Elif Demir", 74, 80, "de", "Die Malerarbeiten im Flur 1. OG fangen wir am Montag an."),
      seg("Markus Hofmann", 82, 89, "de", "Frau Demir, bitte vorher die Spachtelflächen mit Herrn Popescu abnehmen."),
      seg("Elif Demir", 90, 92, "de", "Machen wir am Freitag."),
    ],
    summary: [
      "Vorwandinstallation WC-Anlagen 2. OG erst nach dem Rückbau der Elektro-Altinstallation (Elektriker des Bauherrn).",
      "Innenausbau steht, wenn die WCs bis Dienstag nicht frei sind; die Bauleitung klärt den Termin mit dem Bauherrn.",
      "Malerarbeiten Flur 1. OG ab Montag; die Spachtelflächen werden am Freitag abgenommen.",
    ],
    items: [
      { kind: "behinderung", text: "Drohende Behinderung Innenausbau, WC-Anlagen 2. OG: Elektro-Altinstallation (Elektriker des Bauherrn) nicht zurückgebaut.", quote_de: "Wenn die WCs bis Dienstag nicht frei sind, steht mein Team.", segment: 4, support: [2], trade: "Elektro", area: "2.OG, WC-Anlagen", case_ref: "KL-2026-0038", case_doc_type: "behinderungsanzeige" },
      { kind: "decision", text: "Vorwandinstallation WC erst nach dem Rückbau der Elektro-Altinstallation.", quote_de: "Die Vorwandinstallation in den WC-Anlagen können wir erst setzen, wenn die alte Elektroinstallation raus ist.", segment: 1, trade: "Sanitär" },
      { kind: "task", text: "Beim Bauherrn klären, bis wann die Elektro-Altinstallation in den WCs zurückgebaut ist", quote_de: "Ich frage beim Bauherrn nach, bis wann der Elektriker das erledigt.", segment: 3, owner: "Markus Hofmann (Bauleiter)", due: "morgen", trade: "Elektro" },
      { kind: "task", text: "Spachtelflächen Flur 1. OG gemeinsam abnehmen", quote_de: "bitte vorher die Spachtelflächen mit Herrn Popescu abnehmen", segment: 6, owner: "Elif Demir (Demir Malerbetrieb)", due: "Freitag", trade: "Maler" },
    ],
  },

  // ── A Neubau Bürogebäude Schwabing: the afternoon after the Behinderungsanzeige Fenster Nordseite (KL-…-0036).
  {
    id: IDS.meetingHist5,
    ref: "MT-2026-0005",
    project: IDS.projectRiem,
    type: "bauherr",
    title: (start) => `Abstimmung Fenster Nordseite KW ${isoWeek(start)}`,
    day: 7,
    at: [14, 0],
    participants: [
      HOFMANN,
      p("Stefan Maier", "Bauherr (Schwabing Office Campus GmbH)", IDS.contactRiemBauherr),
      p("Sabine Krämer", "Projektsteuerung (Krämer Projektsteuerung GmbH)", IDS.contactRiemSteuerung),
      p("Liam O'Connor", "Polier Fassade (Muster Bau GmbH)"),
    ],
    segments: [
      seg("Markus Hofmann", 4, 11, "de", "Wir haben heute früh die Behinderungsanzeige für die Nordseite geschickt."),
      seg("Liam O'Connor", 13, 22, "en", "Four of my guys were standing this morning. Without the windows there's nothing we can do on the north side.", "Vier meiner Leute standen heute Morgen. Ohne die Fenster können wir auf der Nordseite nichts machen."),
      seg("Stefan Maier", 24, 31, "de", "Laut Terminplan ist die Fenstermontage erst bis Ende dieser Woche fällig."),
      seg("Sabine Krämer", 33, 40, "de", "Die Laibungsdämmung hängt aber direkt an den Fenstern, das war so abgestimmt."),
      seg("Markus Hofmann", 42, 49, "de", "Wir setzen die Leute bis dahin auf der Ostseite ein, soweit das Gerüst steht."),
      seg("Stefan Maier", 51, 56, "de", "Der Fensterbauer kommt am Donnerstag mit zwei Kolonnen."),
      seg("Markus Hofmann", 58, 63, "de", "Bitte bestätigen Sie uns den Termin schriftlich bis morgen."),
    ],
    summary: [
      "Behinderungsanzeige Fassade Nordseite ist heute früh raus; vier Leute standen.",
      "Bauherr sieht die Fenstermontage laut Terminplan erst Ende der Woche fällig; die Projektsteuerung bestätigt, dass die Laibungsdämmung an den Fenstern hängt.",
      "Fensterbauer kommt Donnerstag mit zwei Kolonnen; der Bauherr bestätigt den Termin schriftlich.",
      "Die Fassadenkolonne arbeitet bis dahin auf der Ostseite.",
    ],
    items: [
      { kind: "behinderung", text: "Fassade Nordseite: Fenster nicht eingebaut, kein WDVS-Anschluss möglich.", quote_de: "Ohne die Fenster können wir auf der Nordseite nichts machen.", quote_original: "Without the windows there's nothing we can do on the north side.", segment: 1, trade: "Fenster", area: "Nordseite", case_ref: "KL-2026-0036", case_doc_type: "behinderungsanzeige", case_action: "existing" },
      { kind: "termin", text: "Fenstermontage Nordseite: Fensterbauer kommt Donnerstag mit zwei Kolonnen.", quote_de: "Der Fensterbauer kommt am Donnerstag mit zwei Kolonnen.", segment: 5, trade: "Fenster", area: "Nordseite", case_action: "noop" },
      { kind: "decision", text: "Fassadenkolonne bis dahin auf der Ostseite, soweit das Gerüst steht.", quote_de: "Wir setzen die Leute bis dahin auf der Ostseite ein, soweit das Gerüst steht.", segment: 4, trade: "Fassade" },
      { kind: "task", text: "Termin Fenstermontage schriftlich bestätigen", quote_de: "Bitte bestätigen Sie uns den Termin schriftlich bis morgen.", segment: 6, owner: "Stefan Maier (Bauherr)", due: "morgen", trade: "Fenster" },
    ],
  },
];

/** The five history meetings (oldest first). */
export function buildHistoryMeetings(now: Date): Meeting[] {
  const region = DEFAULT_HOLIDAY_REGION;
  const today = demoDay(now, region);
  return SPECS.map((s) => {
    const day = subWerktage(today, s.day, region);
    const start = berlinTime(day, s.at[0], s.at[1]);
    const duration = Math.ceil(s.segments.at(-1)!.end_sec + 20);
    let n = 0;
    const verified = verifyItems(s.items, s.segments, { meetingId: s.id, baseDay: day, newId: () => `${s.id}-i${++n}` });
    // verifyItems keeps the order of the raw items it accepts; carry the case links over.
    const raw = s.items.filter((r) => verified.some((v) => v.quote_de === r.quote_de.trim() && v.kind === r.kind));
    const items: MeetingItem[] = verified.map((v, i) => {
      const r = raw[i];
      const linked = r?.case_ref ? { case_ref: r.case_ref, case_doc_type: r.case_doc_type, ...(r.case_action ? { case_action: r.case_action } : {}) } : r?.case_action ? { case_action: r.case_action } : {};
      // Tasks due before the demo day are done.
      return { ...v, ...linked, status: v.kind === "task" && v.due_date && v.due_date < today ? "erledigt" : "offen" };
    });
    const tasks = items.filter((i) => i.kind === "task").length;
    const protocol: MeetingProtocol = {
      ref: s.ref,
      title: s.title ? s.title(start) : defaultTitle(start),
      team_id: null,
      participants: s.participants,
      consent: true,
      started_at: start.toISOString(),
      ended_at: new Date(start.getTime() + duration * 1000).toISOString(),
      duration_sec: duration,
      status: "ready",
      steps: emptySteps(true),
      languages: sortLanguages(s.segments.map((x) => x.language)),
      summary: s.summary,
      items,
      changes: tasks ? [{ kind: "tasks_created", text_de: `${tasks} ${tasks === 1 ? "Aufgabe" : "Aufgaben"} angelegt`, case_id: null, case_ref: null }] : [],
      notice: null,
      error: null,
      source: "seed",
      mail: null,
    };
    return { id: s.id, project_id: s.project, type: s.type, audio_url: null, transcript: { segments: s.segments }, protocol, created_at: start.toISOString() };
  });
}
