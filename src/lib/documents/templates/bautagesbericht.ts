// TODO legal review (SPEC D8): Bautagesbericht, gegliedert nach VHB Bund 411
// (Witterung, Personal, Geräte, Lieferungen, Leistungen, Anordnungen,
// Besondere Vorkommnisse, Unterschriften). A form, not a letter.
import { hasValue } from "@/lib/doctypes";
import { fmtNumber } from "@/lib/labels";
import type { DocBlock } from "../types";
import { dateDe, fact, type Template } from "./kit";

/** One schedule item's quantity today (computed from the evening report). */
export type ProgressRow = { label: string; qty: number; unit: string; planned: number | null };

const WEEKDAY = new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: "Europe/Berlin" });

/** "1 Polier, 3 Facharbeiter, 1 Helfer" → rows; null when the text has another shape. */
export function staffRows(text: string): [string, string][] | null {
  const parts = text
    .split(/[,;]|\bund\b/)
    .map((p) => p.trim())
    .filter(Boolean);
  const rows: [string, string][] = [];
  for (const p of parts) {
    const m = /^(\d+)\s+(.+)$/.exec(p);
    if (!m) return null;
    rows.push([m[2], m[1]]);
  }
  return rows.length ? rows : null;
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);

export const bautagesbericht: Template = (t) => {
  const f = t.c.facts;
  const day = typeof f.date === "string" ? f.date : t.letterDate;
  const weekday = WEEKDAY.format(new Date(`${day}T12:00:00Z`));
  const blocks: DocBlock[] = [];

  blocks.push({ kind: "heading", text: "Personal" });
  const staff = fact(t, "staff");
  const rows = hasValue(f.staff) ? staffRows(staff) : null;
  if (rows) {
    const total = rows.reduce((n, [, c]) => n + Number(c), 0);
    blocks.push({
      kind: "table",
      columns: [{ label: "Qualifikation" }, { label: "Anzahl", numeric: true }],
      rows: [...rows, ["Gesamt", String(total)]],
    });
  } else {
    blocks.push({ kind: "p", text: staff });
  }

  blocks.push({ kind: "heading", text: "Ausgeführte Leistungen" });
  const progress = Array.isArray(f._progress) ? (f._progress as ProgressRow[]) : [];
  if (progress.length) {
    blocks.push({
      kind: "table",
      columns: [{ label: "Leistung lt. Bauzeitenplan" }, { label: "Ist", numeric: true }, { label: "Soll", numeric: true }, { label: "Erfüllung", numeric: true }],
      rows: progress.map((p) => [
        p.label,
        `${fmtNumber(p.qty)} ${p.unit}`.trim(),
        p.planned !== null ? `${fmtNumber(p.planned)} ${p.unit}`.trim() : "–",
        p.planned ? `${Math.round((p.qty / p.planned) * 100)} %` : "–",
      ]),
    });
  } else {
    blocks.push({ kind: "p", text: fact(t, "work_performed") });
  }

  blocks.push(
    { kind: "heading", text: "Geräte und Lieferungen" },
    {
      kind: "facts",
      rows: [
        { label: "Geräte", value: fact(t, "equipment") || "keine Angaben" },
        { label: "Lieferungen", value: fact(t, "deliveries") || "keine Angaben" },
      ],
    },
  );

  const instructions = list(f._instructions);
  blocks.push({ kind: "heading", text: "Anordnungen" });
  blocks.push(instructions.length ? { kind: "bullets", items: instructions } : { kind: "p", text: fact(t, "instructions") || "keine" });

  const incidents = list(f._incidents);
  blocks.push({ kind: "heading", text: "Besondere Vorkommnisse" });
  blocks.push(incidents.length ? { kind: "bullets", items: incidents } : { kind: "p", text: fact(t, "incidents") || "keine" });

  const photos = typeof f._photos === "number" ? f._photos : 0;
  if (photos) {
    blocks.push({ kind: "heading", text: "Fotodokumentation" });
    blocks.push({ kind: "p", text: `${photos} ${photos === 1 ? "Foto" : "Fotos"} von der Baustelle, abgelegt bei den Vorgängen des Tages.` });
  }

  blocks.push({
    kind: "signatures",
    parties: [
      { role: "Polier", name: typeof f._lead_name === "string" ? f._lead_name : null },
      { role: "Bauleitung", name: typeof f._bauleiter_name === "string" ? f._bauleiter_name : null },
    ],
  });

  return {
    form: "report",
    subject: `Bautagesbericht vom ${dateDe(day)}`,
    refs: [
      { label: "Kolonne", value: typeof f._team_name === "string" ? f._team_name : "–" },
      { label: "Polier", value: typeof f._lead_name === "string" ? f._lead_name : "–" },
      { label: "Berichtstag", value: `${weekday}, ${dateDe(day)}` },
      { label: "Witterung", value: fact(t, "weather") || "keine Wetterdaten abrufbar" },
    ],
    blocks,
  };
};
