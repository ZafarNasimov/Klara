import { fmtDate, fmtDateTime } from "@/lib/labels";

export const dDate = (v: unknown): string => {
  if (typeof v !== "string" || !v) return "";
  const d = new Date(v.length === 10 ? `${v}T12:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? v : fmtDate(d);
};

export const dDateTime = (v: unknown): string => {
  if (typeof v !== "string" || !v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : fmtDateTime(d);
};

export const dTime = (v: unknown): string => {
  if (typeof v !== "string" || !v) return "";
  if (/^\d{1,2}:\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d);
};

export const str = (v: unknown, fallback = ""): string =>
  v === undefined || v === null || v === "" ? fallback : String(v);

/** Placeholder shown in the letter for a missing required value (yellow light covers it). */
export const MISSING = "[fehlt]";
