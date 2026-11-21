// Meeting items → real changes, through the same code paths as a call:
// evaluateCase → createCase / updateCase → generateDocument → evidence + event.
// Only items with a quote reach this point (verifyItems).
import "server-only";
import { store } from "@/lib/db";
import { addEvent, addEvidence, createCase, getProjectContext, listCases, listDocumentVersions, updateCase, type ProjectContext } from "@/lib/db/repo";
import { addWerktage, berlinDay, fmtDayDe, werktageBetween, weekday } from "@/lib/deadlines";
import { requireDocType } from "@/lib/doctypes";
import { generateDocument } from "@/lib/documents/generate";
import { evaluateCase } from "@/lib/rules/evaluate";
import { dependents } from "@/lib/rules/plan-actual";
import { resolveTrade } from "@/lib/rules/sphere";
import type { Case, Sphere, Trade } from "@/lib/types";
import { normalizeArea, normalizeText } from "./items";
import { TEMPLATE_DE, type MeetingChange, type MeetingItem, type MeetingView } from "./model";

const WEEKDAY_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const dayWord = (day: string) => `${WEEKDAY_DE[weekday(day)]}, ${fmtDayDe(day)}`;
const OPEN: Case["status"][] = ["entwurf", "unvollstaendig", "bereit", "validiert", "versendet", "beantwortet"];

type Ctx = { m: MeetingView; ctx: ProjectContext; at: Date; day: string; source: string; cases: Case[] };

export async function applyItems(m: MeetingView, items: MeetingItem[], at: Date): Promise<{ items: MeetingItem[]; changes: MeetingChange[] }> {
  const ctx = await getProjectContext(m.project_id);
  const c: Ctx = { m, ctx, at, day: berlinDay(new Date(m.started_at)), source: `${m.title} (${m.ref})`, cases: await listCases(m.project_id) };
  const changes: MeetingChange[] = [];
  const out: MeetingItem[] = [];

  for (const item of items) {
    let next = item;
    // The only evidence is an "unsicher" segment (recognition or translation): never fill a template.
    if (item.uncertain) {
      out.push({ ...item, case_action: "uncertain" });
      continue;
    }
    switch (item.kind) {
      case "anordnung":
        next = await draftOnce(c, item, "anordnung_bestaetigung", {
          instruction_date: c.day,
          place: m.title,
          instructed_by: speakerWithRole(m, item.speaker),
          instruction_text: item.text,
          witnesses: m.participants.filter((p) => p.name !== item.speaker).map((p) => p.name).join(", ") || undefined,
        }, null, changes);
        break;
      case "mehrkosten":
        next = await draftOnce(c, item, "mehrkostenanzeige", {
          work_started: false,
          instruction_date: c.day,
          instructed_by: speakerWithRole(m, item.speaker),
          description: item.text,
          verbal: true,
        }, null, changes);
        break;
      case "mangel": {
        const trade = tradeOf(c, item);
        next = await draftOnce(c, item, "maengelanzeige", {
          noticed_at: c.day,
          defect: item.text,
          area: item.area ?? undefined,
          trade: trade?.name ?? item.trade ?? undefined,
          source: c.source,
          _contact_id: trade?.contact_id ?? null,
        }, null, changes);
        break;
      }
      case "bedenken":
        next = await draftOnce(c, item, "bedenken", { raised_at: c.day, concern: item.text, area: item.area ?? undefined, source: c.source }, null, changes);
        break;
      case "behinderung":
        next = await hindrance(c, item, changes);
        break;
      case "termin":
        // Said, but nothing in the schedule to move (no matching item, or not later): say so.
        if (!(await reschedule(c, item, changes))) next = { ...item, case_action: "noop" };
        break;
      default:
        break;
    }
    out.push(next);
  }

  const tasks = out.filter((i) => i.kind === "task").length;
  if (tasks) changes.push({ kind: "tasks_created", text_de: `${tasks} ${tasks === 1 ? "Aufgabe" : "Aufgaben"} angelegt`, case_id: null, case_ref: null });
  await addEvent(
    {
      project_id: m.project_id,
      case_id: null,
      kind: "meeting_processed",
      payload: { source: `meeting:${m.ref}`, meeting_id: m.id, summary_de: `${m.title} → ${changes.length ? changes.map((x) => x.text_de).join(" · ") : "keine Änderungen"}` },
    },
    at,
  );
  return { items: out, changes };
}

// ── Letters ──────────────────────────────────────────────────────────────

function speakerWithRole(m: MeetingView, speaker: string): string {
  const p = m.participants.find((x) => x.name === speaker);
  const org = p?.role.match(/\(([^)]+)\)/)?.[1];
  return org ? `${speaker} (${org})` : speaker;
}

/** The item's trade; if the sentence does not name one, the speaker's (e.g. "Elektro (vom Bauherrn beauftragt)"). */
function tradeOf(c: Ctx, item: MeetingItem): Trade | null {
  const named = item.trade ? resolveTrade(item.trade, c.ctx.trades) : null;
  if (named) return named;
  const role = c.m.participants.find((p) => p.name === item.speaker)?.role.toLowerCase() ?? "";
  return c.ctx.trades.find((t) => role.includes(t.name.toLowerCase())) ?? null;
}

function sphereOf(trade: Trade | null): Sphere | null {
  if (!trade) return "unclear";
  return trade.contracted_by === "client" ? "client" : trade.team_id ? "own_team" : "own_sub";
}

function evaluate(docType: string, facts: Record<string, unknown>, sphere: Sphere | null, c: Ctx) {
  const ev = evaluateCase(
    { def: requireDocType(docType), facts, sphere, confidence: 0.9, now: c.at, subcontractorContactId: typeof facts._contact_id === "string" ? facts._contact_id : null },
    c.ctx,
  );
  return { missing_fields: ev.missing_fields, checks: ev.checks, deadline_at: ev.deadline.due_at, deadline_rule: ev.deadline_rule, flags: ["from_meeting", ...ev.flags] };
}

/** A new draft, unless the same quote already produced one (re-running a meeting never duplicates). */
async function draftOnce(
  c: Ctx,
  item: MeetingItem,
  docType: string,
  facts: Record<string, unknown>,
  sphere: Sphere | null,
  changes: MeetingChange[],
): Promise<MeetingItem> {
  const q = normalizeText(item.quote_de);
  const existing = c.cases.find((x) => x.doc_type === docType && OPEN.includes(x.status) && normalizeText(String(x.facts._meeting_quote ?? "")) === q);
  const title = TEMPLATE_DE[item.kind as keyof typeof TEMPLATE_DE]?.title ?? docType;
  if (existing) {
    changes.push({ kind: "case_updated", text_de: `${existing.reference} bereits vorhanden: ${title}`, case_id: existing.id, case_ref: existing.reference, case_doc_type: docType });
    return { ...item, updated_case_id: existing.id, case_ref: existing.reference, case_action: "existing", case_doc_type: docType };
  }
  const full = { ...clean(facts), _meeting_id: c.m.id, _meeting_ref: c.m.ref, _meeting_quote: item.quote_de, _meeting_quote_original: item.quote_original, _meeting_quote_language: item.quote_language, _confidence: 0.9 };
  const ev = evaluate(docType, full, sphere, c);
  const created = await createCase(
    {
      project_id: c.m.project_id,
      team_id: c.m.team_id,
      conversation_id: null,
      doc_type: docType,
      status: ev.missing_fields.length ? "unvollstaendig" : "bereit",
      sphere,
      facts: full,
      ...ev,
      parent_case_id: null,
      created_by: null,
      asked_fields: [],
      declined_fields: [],
    },
    c.at,
  );
  c.cases.push(created);
  await generateDocument(created.id, c.at, { ctx: c.ctx });
  await evidence(c, created.id, item);
  await event(c, created, "meeting_case_created", `Neuer Entwurf ${created.reference}: ${title}`);
  changes.push({ kind: "case_created", text_de: `Neuer Entwurf ${created.reference}: ${title}`, case_id: created.id, case_ref: created.reference, case_doc_type: docType });
  return { ...item, created_case_id: created.id, case_ref: created.reference, case_action: "created", case_doc_type: docType };
}

/** Hindrance: update the open Behinderungsanzeige for the same trade and area, else draft one. */
async function hindrance(c: Ctx, item: MeetingItem, changes: MeetingChange[]): Promise<MeetingItem> {
  const trade = tradeOf(c, item);
  const area = normalizeArea(item.area);
  const match = c.cases.find((x) => {
    if (x.doc_type !== "behinderungsanzeige" || !OPEN.includes(x.status)) return false;
    const caseArea = normalizeArea(typeof x.facts.area === "string" ? x.facts.area : null);
    if (area && caseArea && caseArea !== area) return false;
    const text = `${x.facts.cause ?? ""} ${x.facts.affected_works ?? ""} ${x.facts._trade ?? ""}`.toLowerCase();
    return trade ? text.includes(trade.name.toLowerCase()) : true;
  });
  const until = item.new_date ? `voraussichtlich bis ${dayWord(item.new_date)} (${c.source})` : null;

  if (match) {
    const sent = (await listDocumentVersions(match.id)).some((v) => v.immutable);
    const what = item.new_date ? `voraussichtliches Ende ${WEEKDAY_DE[weekday(item.new_date)]}` : "neue Angaben";
    if (!sent && until) {
      const facts = { ...match.facts, expected_duration: until };
      const ev = evaluate(match.doc_type, facts, match.sphere, c);
      const updated = await updateCase(match.id, { facts, missing_fields: ev.missing_fields, checks: ev.checks }, c.at);
      await generateDocument(updated.id, c.at, { ctx: c.ctx });
    }
    const text = `${match.reference} aktualisiert: ${what}${sent ? " (Schreiben bereits versendet, Nachtrag prüfen)" : ""}`;
    await evidence(c, match.id, item);
    await event(c, match, "meeting_case_updated", text);
    changes.push({ kind: "case_updated", text_de: text, case_id: match.id, case_ref: match.reference, case_doc_type: match.doc_type });
    return { ...item, updated_case_id: match.id, case_ref: match.reference, case_action: "updated", case_doc_type: match.doc_type };
  }

  return draftOnce(
    c,
    item,
    "behinderungsanzeige",
    { start_at: c.m.started_at, area: area ?? undefined, cause: item.text, expected_duration: until ?? undefined, _trade: trade?.name },
    sphereOf(trade),
    changes,
  );
}

// ── Schedule ─────────────────────────────────────────────────────────────

async function reschedule(c: Ctx, item: MeetingItem, changes: MeetingChange[]): Promise<boolean> {
  const trade = tradeOf(c, item);
  if (!trade || !item.new_date) return false;
  const area = normalizeArea(item.area);
  const sched = c.ctx.schedule.find((s) => s.trade_id === trade.id && (!area || normalizeArea(s.area) === area));
  if (!sched || item.new_date <= sched.end_date) return false;
  const delay = werktageBetween(sched.end_date, item.new_date);
  await store().update("schedule_item", sched.id, { end_date: item.new_date });
  const moved = [{ trade: trade.name, area: sched.area, delay, old: sched.end_date, next: item.new_date }];
  for (const dep of dependents(sched.id, c.ctx.schedule)) {
    const start = addWerktage(dep.start_date, delay);
    const end = addWerktage(dep.end_date, delay);
    await store().update("schedule_item", dep.id, { start_date: start, end_date: end });
    const depTrade = c.ctx.trades.find((t) => t.id === dep.trade_id);
    moved.push({ trade: depTrade?.name ?? "Folgegewerk", area: dep.area, delay, old: dep.end_date, next: end });
  }
  for (const mv of moved) {
    const text = `Termin ${mv.trade} ${mv.area.replace(".OG", ". OG")}: +${mv.delay} ${mv.delay === 1 ? "Arbeitstag" : "Arbeitstage"}`;
    changes.push({ kind: "schedule_updated", text_de: text, case_id: null, case_ref: null });
    await addEvent(
      {
        project_id: c.m.project_id,
        case_id: null,
        kind: "meeting_schedule",
        payload: { source: `meeting:${c.m.ref}`, meeting_id: c.m.id, trade: mv.trade, area: mv.area, old_end: mv.old, new_end: mv.next, delay_days: mv.delay, summary_de: `${c.m.title} → ${text}` },
      },
      c.at,
    );
  }
  return true;
}

// ── Audit trail ──────────────────────────────────────────────────────────

async function evidence(c: Ctx, caseId: string, item: MeetingItem) {
  await addEvidence(
    { case_id: caseId, kind: "meeting", ref: c.m.id, data: { meeting_ref: c.m.ref, title: c.m.title, quote: item.quote_de, quote_original: item.quote_original, quote_language: item.quote_language, speaker: item.speaker, ts_sec: item.ts_sec } },
    c.at,
  );
}

async function event(c: Ctx, target: Case, kind: string, text: string) {
  await addEvent(
    {
      project_id: c.m.project_id,
      case_id: target.id,
      kind,
      payload: { source: `meeting:${c.m.ref}`, meeting_id: c.m.id, reference: target.reference, doc_type: target.doc_type, summary_de: `${c.m.title} → ${text}` },
    },
    c.at,
  );
}

const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));
