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
  client: "Bauherr",
  own_sub: "Eigener Nachunternehmer",
  own_team: "Eigene Kolonne",
  weather: "Witterung",
  unclear: "Unklar",
};

const dt = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const d = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const t = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

export const fmtDateTime = (iso: string | Date) => dt.format(new Date(iso));
export const fmtDate = (iso: string | Date) => d.format(new Date(iso));
export const fmtTime = (iso: string | Date) => t.format(new Date(iso));

const short = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
/** "20.11., 07:00" for dense tables. */
export const fmtShort = (iso: string | Date) => short.format(new Date(iso));
