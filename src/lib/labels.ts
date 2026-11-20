// German UI labels and formatters (client-safe).
import type { CaseStatus, Sphere } from "@/lib/types";

export const CASE_STATUS_DE: Record<CaseStatus, string> = {
  entwurf: "Entwurf",
  unvollstaendig: "Unvollständig",
  bereit: "Bereit",
  validiert: "Validiert",
  versendet: "Versendet",
  beantwortet: "Beantwortet",
  abgeschlossen: "Abgeschlossen",
};

export const SPHERE_DE: Record<Sphere, string> = {
  client: "Auftraggeber",
  own_sub: "eigener Nachunternehmer",
  own_team: "eigene Kolonne",
  weather: "Witterung",
  unclear: "unklar",
};

/** Timeline wording for event kinds. Kinds without a label stay out of the timeline. */
export const EVENT_DE: Record<string, string> = {
  case_created: "Vorgang angelegt",
  case_confirmed: "Vom Polier bestätigt",
  document_generated: "Dokument erstellt",
  case_validated: "Validiert",
  returned_for_completion: "Zurück zur Ergänzung",
  correction_requested: "Korrektur durch den Polier angefordert",
  email_drafted: "E-Mail vorbereitet",
  email_sent: "E-Mail versendet",
  email_delivered: "Zustellung bestätigt",
  reply_received: "Antwort eingegangen",
  reply_classified: "Antwort ausgewertet",
  followup_proposed: "Folgeschreiben vorgeschlagen",
  case_closed: "Vorgang abgeschlossen",
  diary_entry: "Bautagebuch-Eintrag",
  risk_flag: "Interner Hinweis",
  deviation: "Abweichung vom Bauzeitenplan",
  progress_recorded: "Leistung gemeldet",
  call_ended: "Gespräch beendet",
  unsupported_event: "Meldung ohne Vorlage",
};

const TZ = "Europe/Berlin";

const dateTimeFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFmt = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const shortFmt = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const asDate = (v: string | Date) => (typeof v === "string" ? new Date(v) : v);

/** "20.11.2026, 07:00" */
export const fmtDateTime = (v: string | Date) => dateTimeFmt.format(asDate(v));
/** "20.11.2026" (accepts YYYY-MM-DD without shifting the day) */
export const fmtDate = (v: string | Date) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join(".") : dateFmt.format(asDate(v));
/** "07:00" */
export const fmtTime = (v: string | Date) => timeFmt.format(asDate(v));
/** "20.11., 07:00" */
export const fmtShort = (v: string | Date) => shortFmt.format(asDate(v));

export const fmtNumber = (n: number, digits = 0) =>
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);

export const LANGUAGE_DE: Record<string, string> = {
  de: "Deutsch",
  en: "Englisch",
  ru: "Russisch",
  pl: "Polnisch",
  tr: "Türkisch",
  ro: "Rumänisch",
  uk: "Ukrainisch",
};

const isoDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
/** Berlin calendar day (YYYY-MM-DD), client-safe (no holiday data). */
export const berlinDayOf = (v: string | Date) => isoDayFmt.format(asDate(v));
