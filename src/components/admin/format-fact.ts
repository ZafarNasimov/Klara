// Display formatting for case facts by field type (client-safe).
import type { FieldType } from "@/lib/doctypes";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/labels";

export function formatFact(type: FieldType, v: unknown): string {
  if (v === null || v === undefined || v === "") return "–";
  switch (type) {
    case "datetime": {
      if (typeof v !== "string") return String(v);
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? v : `${fmtDateTime(d)} Uhr`;
    }
    case "date":
      return typeof v === "string" ? fmtDate(v.slice(0, 10)) : String(v);
    case "bool":
      return v === true ? "ja" : v === false ? "nein" : String(v);
    case "number":
      return typeof v === "number" ? fmtNumber(v, 2) : String(v);
    case "list":
      return Array.isArray(v) ? v.map(String).join("; ") : String(v);
    default:
      return typeof v === "string" ? v : JSON.stringify(v);
  }
}
