// Bautagesbericht (SPEC §5.2): one report per team and day, compiled from what
// the day already recorded: evening quantities per schedule item (plan vs.
// actual), the cases the team reported, diary notes, site weather and names.
// Facts the Polier gave themselves (Personal, Geräte, Lieferungen) are kept;
// computed facts are rebuilt each time. The report is a case of type
// `bautagesbericht`, so versions, validation and "Zurück zur Ergänzung" work
// as for letters. Reference: BTB-YYYYMMDD-<KOLONNE>, outside the KL numbering.
import "server-only";
import { store } from "@/lib/db";
import { addEvent, getDailyReport, getProjectContext, uid, updateCase } from "@/lib/db/repo";
import { NotFoundError } from "@/lib/db/store";
import { berlinDay, berlinTime } from "@/lib/deadlines";
import { generateDocument } from "@/lib/documents/generate";
import type { ProgressRow } from "@/lib/documents/templates/bautagesbericht";
import { getDocType, requireDocType } from "@/lib/doctypes";
import { fmtNumber } from "@/lib/labels";
import { evaluateCase } from "@/lib/rules";
import type { Case, CaseStatus, Team } from "@/lib/types";
import { fetchWeather } from "@/lib/weather";

const DOC = "bautagesbericht";
const SENT = new Set<CaseStatus>(["versendet", "beantwortet", "abgeschlossen"]);
/** Facts the report computes; everything else on the case came from people. */
const COMPUTED = ["date", "work_performed", "instructions", "incidents", "_progress", "_instructions", "_incidents", "_team_name", "_lead_name", "_bauleiter_name"];
const SUMMARY_KEYS = ["cause", "instruction_text", "description", "still_affected", "basis"];

export function reportReference(team: Pick<Team, "name">, day: string): string {
  const crew = team.name
    .replace(/^Team\s+/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "SS")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase();
  return `BTB-${day.replaceAll("-", "")}-${crew || "TEAM"}`;
}

export async function findDailyReportCase(teamId: string, day: string): Promise<Case | null> {
  const cases = await store().list("case", { where: { team_id: teamId, doc_type: DOC } });
  return cases.find((c) => c.facts.date === day) ?? null;
}

/** "Behinderungsanzeige KL-2026-0042: Die Elektroarbeiten im 2.OG sind nicht abgeschlossen" */
function caseLine(c: Case): string {
  const def = getDocType(c.doc_type);
  if (c.doc_type === "info_folgegewerk") {
    const days = Number(c.facts.forecast_delay_days ?? 0);
    return `${def?.title_de ?? c.doc_type} ${c.reference}: ${String(c.facts.successor ?? "Folgegewerk")}, voraussichtlich ${days ? `ca. ${fmtNumber(days)} Arbeitstage` : "kein"} Verzug`;
  }
  const key = SUMMARY_KEYS.find((k) => typeof c.facts[k] === "string" && (c.facts[k] as string).trim());
  const what = key ? (c.facts[key] as string).trim().replace(/[.\s]+$/, "") : null;
  const area = typeof c.facts.area === "string" ? c.facts.area : null;
  const head = `${def?.title_de ?? c.doc_type} ${c.reference}`;
  return what ? `${head}: ${what}` : area ? `${head}, ${area}` : head;
}

/** Build or refresh the team's Bautagesbericht for `day` and write its next version. */
export async function compileDailyReport(teamId: string, day: string, at: Date): Promise<Case> {
  const s = store();
  const team = await s.get("team", teamId);
  if (!team) throw new NotFoundError("team", teamId);
  const ctx = await getProjectContext(team.project_id);
  const existing = await findDailyReportCase(teamId, day);
  if (existing && SENT.has(existing.status)) return existing;

  // Evening quantities: the diary says which items this team reported; the progress table holds the latest amount.
  const diary = await getDailyReport(teamId, day);
  const entries = Array.isArray(diary?.data.entries) ? (diary.data.entries as Record<string, unknown>[]) : [];
  const itemIds = [...new Set(entries.filter((e) => e.kind === "progress" && typeof e.schedule_item_id === "string").map((e) => e.schedule_item_id as string))];
  const progress: ProgressRow[] = [];
  for (const id of itemIds) {
    const item = ctx.schedule.find((x) => x.id === id);
    const row = (await s.list("progress_entry", { where: { schedule_item_id: id, date: day } }))[0];
    if (!item || !row) continue;
    const trade = ctx.trades.find((t) => t.id === item.trade_id);
    progress.push({ label: `${trade?.name ?? item.activity} ${item.area}`.trim(), qty: row.actual_qty, unit: item.unit ?? "", planned: item.planned_per_day });
  }

  // The team's reports of the day (letters, not drafts): instructions apart, the rest are "Besondere Vorkommnisse".
  const dayCases = (await s.list("case", { where: { team_id: teamId } }))
    .filter((c) => c.doc_type !== DOC && c.status !== "entwurf" && berlinDay(new Date(c.created_at)) === day)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const instructions = dayCases.filter((c) => c.doc_type === "anordnung_bestaetigung").map(caseLine);
  const incidents = dayCases.filter((c) => c.doc_type !== "anordnung_bestaetigung" && c.doc_type !== "mehrkostenanzeige").map(caseLine);
  const notes = entries
    .filter((e) => e.kind === "note" && typeof e.text === "string" && !/^Arbeiten nach Plan/i.test(e.text as string))
    .map((e) => e.text as string);

  const lead = ctx.users.find((u) => u.id === team.lead_user_id) ?? null;
  const bauleiter = ctx.users.find((u) => u.role === "bauleiter") ?? null;
  const weather = await fetchWeather(ctx.project.lat, ctx.project.lng, berlinTime(day, 12, 0));
  const weatherText = weather
    ? [
        weather.condition_de,
        weather.temp_min_c !== null && weather.temp_max_c !== null ? `${fmtNumber(weather.temp_min_c, 0)} bis ${fmtNumber(weather.temp_max_c, 0)} °C` : null,
        weather.precipitation_mm ? `Niederschlag ${fmtNumber(weather.precipitation_mm, 1)} mm` : null,
        weather.gust_max_kmh !== null ? `Böen bis ${fmtNumber(weather.gust_max_kmh, 0)} km/h` : null,
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  const kept = Object.fromEntries(Object.entries(existing?.facts ?? {}).filter(([k]) => !COMPUTED.includes(k)));
  const facts: Record<string, unknown> = {
    ...kept,
    date: day,
    ...(weatherText ? { weather: weatherText } : {}),
    work_performed: progress.map((p) => `${p.label}: ${fmtNumber(p.qty)} ${p.unit}`.trim()),
    _progress: progress,
    ...(instructions.length ? { instructions: instructions.join("; ") } : {}),
    _instructions: instructions,
    ...(incidents.length || notes.length ? { incidents: [...incidents, ...notes].join("; ") } : {}),
    _incidents: [...incidents, ...notes],
    _team_name: team.name,
    _lead_name: lead?.name ?? null,
    _bauleiter_name: bauleiter?.name ?? null,
  };

  const def = requireDocType(DOC);
  const created_at = existing?.created_at ?? at.toISOString();
  const ev = evaluateCase({ def, facts, sphere: null, confidence: null, now: new Date(created_at), subcontractorContactId: null }, ctx);
  const status: CaseStatus = ev.missing_fields.length ? "unvollstaendig" : "bereit";
  const patch = {
    facts,
    status,
    missing_fields: ev.missing_fields,
    checks: ev.checks,
    deadline_at: ev.deadline.due_at,
    deadline_rule: ev.deadline_rule,
  };

  let c: Case;
  if (existing) {
    c = await updateCase(existing.id, patch, at);
  } else {
    c = await s.insert("case", {
      id: uid(),
      project_id: team.project_id,
      team_id: team.id,
      conversation_id: null,
      doc_type: DOC,
      sphere: null,
      parent_case_id: null,
      reference: reportReference(team, day),
      created_by: lead?.id ?? null,
      asked_fields: [],
      declined_fields: [],
      flags: [],
      created_at,
      updated_at: created_at,
      ...patch,
    });
    await addEvent({ project_id: c.project_id, case_id: c.id, kind: "case_created", payload: { reference: c.reference, doc_type: DOC } }, at);
  }

  const version = await generateDocument(c.id, at);
  // Same text as the approved version: the approval stands.
  if (version?.validated_at && c.status === "bereit") c = await updateCase(c.id, { status: "validiert" }, at);
  return c;
}
