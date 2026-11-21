// Domain queries on top of the store. Server only.
import "server-only";
import { clockBase, withOffset } from "@/lib/clock";
import { berlinDay, deadlineView, DEFAULT_HOLIDAY_REGION } from "@/lib/deadlines";
import { getDocType } from "@/lib/doctypes";
import { fmtDate } from "@/lib/labels";
import type {
  AppEvent,
  AppUser,
  Case,
  CaseView,
  Company,
  Contact,
  Conversation,
  DailyReport,
  DocumentVersion,
  Evidence,
  ProgressEntry,
  Project,
  ScheduleItem,
  Team,
  Trade,
  Turn,
} from "@/lib/types";
import { store } from "./index";
import { withDashboardHistory } from "./dashboard-history";
import { withDemoHistory } from "./demo-history";
import { buildSeed, DEFAULT_PROJECT_ID } from "./seed";
import { NotFoundError } from "./store";

export { DEFAULT_PROJECT_ID };

export const uid = () => crypto.randomUUID();

// ── Project context ───────────────────────────────────────────────────

export type ProjectContext = {
  project: Project;
  company: Company;
  contacts: Contact[];
  trades: Trade[];
  teams: Team[];
  users: AppUser[];
  schedule: ScheduleItem[];
  progress: ProgressEntry[];
};

export async function getProject(projectId: string): Promise<Project> {
  const p = await store().get("project", projectId);
  if (!p) throw new NotFoundError("project", projectId);
  return p;
}

export async function listProjects(): Promise<Project[]> {
  return store().list("project", { order: { column: "name" } });
}

/** Two database round trips: everything keyed by the project id, then company and progress. */
export async function getProjectContext(projectId: string = DEFAULT_PROJECT_ID): Promise<ProjectContext> {
  const s = store();
  const [project, contacts, trades, teams, users, schedule] = await Promise.all([
    getProject(projectId),
    s.list("contact", { where: { project_id: projectId } }),
    s.list("trade", { where: { project_id: projectId } }),
    s.list("team", { where: { project_id: projectId }, order: { column: "name" } }),
    s.list("app_user", { order: { column: "name" } }),
    s.list("schedule_item", { where: { project_id: projectId }, order: { column: "start_date" } }),
  ]);
  const [company, progress] = await Promise.all([
    s.get("company", project.company_id),
    Promise.all(schedule.map((it) => s.list("progress_entry", { where: { schedule_item_id: it.id } }))).then((x) => x.flat()),
  ]);
  if (!company) throw new NotFoundError("company", project.company_id);
  return { project, company, contacts, trades, teams, users, schedule, progress };
}

export function holidayRegion(project: Project): string {
  return typeof project.settings.holiday_region === "string" ? project.settings.holiday_region : DEFAULT_HOLIDAY_REGION;
}

/** "Now" on the project's demo clock. */
export async function projectNow(projectId: string = DEFAULT_PROJECT_ID): Promise<Date> {
  const p = await store().get("project", projectId);
  return withOffset(clockBase(), p?.settings.demo_clock_offset_ms);
}

export async function updateProjectSettings(projectId: string, patch: Partial<Project["settings"]>): Promise<Project> {
  const p = await getProject(projectId);
  return store().update("project", projectId, { settings: { ...p.settings, ...patch } });
}

// ── Cases ─────────────────────────────────────────────────────────────

export async function listCases(projectId: string = DEFAULT_PROJECT_ID): Promise<Case[]> {
  return store().list("case", { where: { project_id: projectId }, order: { column: "created_at", ascending: false } });
}

export async function getCase(id: string): Promise<Case | null> {
  return store().get("case", id);
}

export async function requireCase(id: string): Promise<Case> {
  const c = await getCase(id);
  if (!c) throw new NotFoundError("case", id);
  return c;
}

const REF = /^KL-(\d{4})-(\d{4})$/;

/** Next reference KL-YYYY-NNNN. Numbering starts at 0042 for the demo. */
export async function nextReference(projectId: string, at: Date): Promise<string> {
  const year = berlinDay(at).slice(0, 4);
  // References are unique across all projects (DB constraint).
  const all = await store().list("case");
  let max = 41;
  for (const c of all) {
    const m = REF.exec(c.reference);
    if (m && m[1] === year) max = Math.max(max, Number(m[2]));
  }
  void projectId;
  return `KL-${year}-${String(max + 1).padStart(4, "0")}`;
}

export type NewCase = Omit<Case, "id" | "reference" | "created_at" | "updated_at"> & { created_at?: string };

// Serialize case creation inside this process so references never collide;
// across serverless instances the DB unique constraint plus a retry covers it.
let createChain: Promise<unknown> = Promise.resolve();

export function createCase(input: NewCase, at: Date): Promise<Case> {
  const run = async (): Promise<Case> => {
    const created_at = input.created_at ?? at.toISOString();
    for (let attempt = 0; ; attempt++) {
      const reference = await nextReference(input.project_id, at);
      try {
        return await store().insert("case", { ...input, id: uid(), reference, created_at, updated_at: created_at });
      } catch (err) {
        if (attempt >= 2) throw err;
      }
    }
  };
  const result = createChain.then(run, run);
  createChain = result.catch(() => undefined);
  return result;
}

/**
 * A case and its linked letters (SPEC §1 "timeline shows full chain"): up to
 * the first case, then everything that follows from it (e.g. Behinderungsanzeige
 * → Stellungnahme zur Zurückweisung), oldest first.
 */
export async function caseChain(c: Case): Promise<Case[]> {
  let first = c;
  for (let i = 0; i < 4 && first.parent_case_id; i++) {
    const p = await getCase(first.parent_case_id);
    if (!p) break;
    first = p;
  }
  const out = [first];
  let frontier = [first];
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const next = (await Promise.all(frontier.map((f) => store().list("case", { where: { parent_case_id: f.id } })))).flat();
    out.push(...next);
    frontier = next;
  }
  return out.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function updateCase(id: string, patch: Partial<Case>, at: Date = new Date()): Promise<Case> {
  return store().update("case", id, { ...patch, updated_at: at.toISOString() });
}

/** Case row + read-time deadline + names, for the API. */
export async function toCaseViews(cases: Case[], ctx?: ProjectContext): Promise<CaseView[]> {
  if (!cases.length) return [];
  const pctx = ctx ?? (await getProjectContext(cases[0].project_id));
  const now = withOffset(clockBase(), pctx.project.settings.demo_clock_offset_ms);
  const region = holidayRegion(pctx.project);
  const sentAt = new Map<string, string | null>();
  const checkedAt = new Map<string, string | null>();
  for (const c of cases) {
    if (["versendet", "beantwortet", "abgeschlossen"].includes(c.status)) {
      const versions = await listDocumentVersions(c.id);
      sentAt.set(c.id, versions.find((v) => v.sent_at)?.sent_at ?? null);
    } else if (c.status === "validiert" && getDocType(c.doc_type)?.recipient === "internal") {
      // An internal report is finished once the site manager validated it (it is never sent).
      const versions = await listDocumentVersions(c.id);
      checkedAt.set(c.id, versions.find((v) => v.validated_at)?.validated_at ?? null);
    }
  }
  return cases.map((c) => ({
    ...c,
    deadline: checkedAt.has(c.id)
      ? { due_at: c.deadline_at, status: "ok" as const, label_de: checkedAt.get(c.id) ? `geprüft am ${fmtDate(checkedAt.get(c.id)!)}` : "geprüft" }
      : deadlineView(c, now, region, sentAt.get(c.id)),
    team_name: pctx.teams.find((t) => t.id === c.team_id)?.name ?? null,
    author_name: pctx.users.find((u) => u.id === c.created_by)?.name ?? null,
  }));
}

// ── Conversations & turns ─────────────────────────────────────────────

export async function createConversation(
  input: Pick<Conversation, "team_id" | "user_id" | "kind"> & { language?: string | null },
  at: Date,
): Promise<Conversation> {
  return store().insert("conversation", {
    id: uid(),
    team_id: input.team_id,
    user_id: input.user_id,
    kind: input.kind,
    language: input.language ?? null,
    status: "open",
    started_at: at.toISOString(),
    ended_at: null,
    state: { pending_case_ids: [] },
  });
}

export async function getConversation(id: string): Promise<Conversation | null> {
  return store().get("conversation", id);
}

export async function updateConversation(id: string, patch: Partial<Conversation>): Promise<Conversation> {
  return store().update("conversation", id, patch);
}

export async function listConversations(teamId: string): Promise<Conversation[]> {
  return store().list("conversation", { where: { team_id: teamId }, order: { column: "started_at", ascending: false } });
}

/** Turns of a conversation, oldest first. With `last`, only the last n. */
export async function listTurns(conversationId: string, last?: number): Promise<Turn[]> {
  const all = await store().list("turn", { where: { conversation_id: conversationId }, order: { column: "created_at" } });
  return last ? all.slice(-last) : all;
}

export async function addTurn(input: Omit<Turn, "id" | "created_at">, at: Date): Promise<Turn> {
  return store().insert("turn", { ...input, id: uid(), created_at: at.toISOString() });
}

// ── Evidence, events, documents ───────────────────────────────────────

export async function addEvidence(input: Omit<Evidence, "id" | "created_at">, at: Date): Promise<Evidence> {
  return store().insert("evidence", { ...input, id: uid(), created_at: at.toISOString() });
}

export async function listEvidence(caseId: string): Promise<Evidence[]> {
  return store().list("evidence", { where: { case_id: caseId }, order: { column: "created_at" } });
}

export async function addEvent(input: Omit<AppEvent, "id" | "created_at">, at: Date): Promise<AppEvent> {
  return store().insert("event", { ...input, id: uid(), created_at: at.toISOString() });
}

export async function listEvents(q: { projectId?: string; caseId?: string; limit?: number }): Promise<AppEvent[]> {
  const where = q.caseId ? { case_id: q.caseId } : { project_id: q.projectId ?? DEFAULT_PROJECT_ID };
  return store().list("event", { where, order: { column: "created_at", ascending: false }, limit: q.limit });
}

export async function listDocumentVersions(caseId: string): Promise<DocumentVersion[]> {
  return store().list("document_version", { where: { case_id: caseId }, order: { column: "version", ascending: false } });
}

// ── Diary & progress ──────────────────────────────────────────────────

/** Append an entry to the team's daily report (Bautagesbericht data) of a day. */
export async function addDiaryEntry(teamId: string, day: string, entry: Record<string, unknown>): Promise<DailyReport> {
  const s = store();
  const existing = (await s.list("daily_report", { where: { team_id: teamId, date: day } }))[0];
  if (existing) {
    const entries = Array.isArray(existing.data.entries) ? existing.data.entries : [];
    return s.update("daily_report", existing.id, { data: { ...existing.data, entries: [...entries, entry] } });
  }
  return s.insert("daily_report", { id: uid(), team_id: teamId, date: day, data: { entries: [entry] }, status: "entwurf", missing_fields: [] });
}

export async function getDailyReport(teamId: string, day: string): Promise<DailyReport | null> {
  return (await store().list("daily_report", { where: { team_id: teamId, date: day } }))[0] ?? null;
}

/** Record today's quantity for a schedule item (replaces an earlier value of the same day). */
export async function upsertProgress(scheduleItemId: string, day: string, qty: number, note: string | null): Promise<ProgressEntry> {
  const s = store();
  const existing = (await s.list("progress_entry", { where: { schedule_item_id: scheduleItemId, date: day } }))[0];
  if (existing) return s.update("progress_entry", existing.id, { actual_qty: qty, note });
  return s.insert("progress_entry", { id: uid(), schedule_item_id: scheduleItemId, date: day, actual_qty: qty, note });
}

// ── Demo ──────────────────────────────────────────────────────────────

/** "Demo zurücksetzen": the three sites plus three weeks of past letters, replies and daily reports. */
export async function resetDemo(): Promise<void> {
  const now = clockBase();
  await store().reset(withDashboardHistory(withDemoHistory(buildSeed(now), now), now));
}
