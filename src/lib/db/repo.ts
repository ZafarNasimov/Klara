// Domain-level data access on top of the Store interface.
import "server-only";
import { clockNow } from "@/lib/clock";
import type {
  AppEvent,
  Case,
  Conversation,
  ConversationKind,
  Evidence,
  Turn,
} from "@/lib/types";
import { store } from "./index";
import { buildSeed, IDS } from "./seed";

export const DEFAULT_PROJECT_ID = IDS.project;

export const uid = () => crypto.randomUUID();

export async function now(projectId: string = DEFAULT_PROJECT_ID): Promise<Date> {
  const p = await store().get("project", projectId);
  return clockNow(p?.settings?.demo_clock_offset_ms ?? 0);
}

export type ProjectContext = Awaited<ReturnType<typeof getProjectContext>>;

export async function getProjectContext(projectId: string = DEFAULT_PROJECT_ID) {
  const s = store();
  const project = await s.get("project", projectId);
  if (!project) throw new Error(`Projekt ${projectId} nicht gefunden`);
  const [company, contacts, trades, teams, users, schedule, progress] = await Promise.all([
    s.get("company", project.company_id),
    s.list("contact", { where: { project_id: projectId } }),
    s.list("trade", { where: { project_id: projectId } }),
    s.list("team", { where: { project_id: projectId } }),
    s.list("app_user"),
    s.list("schedule_item", { where: { project_id: projectId } }),
    s.list("progress_entry"),
  ]);
  if (!company) throw new Error("Firma nicht gefunden");
  return { project, company, contacts, trades, teams, users, schedule, progress };
}

export async function listProjects() {
  return store().list("project");
}

// ── Cases ─────────────────────────────────────────────────────────────

export async function listCases(projectId: string = DEFAULT_PROJECT_ID) {
  return store().list("case", {
    where: { project_id: projectId },
    orderBy: { column: "created_at", ascending: false },
  });
}

export async function getCase(id: string) {
  return store().get("case", id);
}

const REFERENCE_BASE = 41; // first demo case becomes KL-<year>-0042

export async function nextReference(at: Date): Promise<string> {
  const year = at.getUTCFullYear();
  const all = await store().list("case");
  const prefix = `KL-${year}-`;
  const max = all
    .map((c) => (c.reference.startsWith(prefix) ? Number(c.reference.slice(prefix.length)) : 0))
    .reduce((a, b) => Math.max(a, b), REFERENCE_BASE);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export async function createCase(input: Omit<Case, "id" | "reference" | "created_at"> & { created_at?: string }) {
  const at = input.created_at ? new Date(input.created_at) : await now(input.project_id);
  const row: Case = {
    ...input,
    id: uid(),
    reference: await nextReference(at),
    created_at: at.toISOString(),
  };
  return store().insert("case", row);
}

export async function updateCase(id: string, patch: Partial<Case>) {
  return store().update("case", id, patch);
}

// ── Conversations & turns ─────────────────────────────────────────────

export async function createConversation(input: {
  team_id: string;
  user_id: string;
  kind: ConversationKind;
  language?: string | null;
}): Promise<Conversation> {
  const team = await store().get("team", input.team_id);
  const at = await now(team?.project_id);
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

export async function getConversation(id: string) {
  return store().get("conversation", id);
}

export async function updateConversation(id: string, patch: Partial<Conversation>) {
  return store().update("conversation", id, patch);
}

export async function listConversations(teamId: string) {
  return store().list("conversation", {
    where: { team_id: teamId },
    orderBy: { column: "started_at", ascending: false },
  });
}

export async function listTurns(conversationId: string, limit?: number) {
  const turns = await store().list("turn", {
    where: { conversation_id: conversationId },
    orderBy: { column: "created_at", ascending: true },
  });
  return limit ? turns.slice(-limit) : turns;
}

export async function addTurn(input: Omit<Turn, "id" | "created_at">, at: Date) {
  return store().insert("turn", { ...input, id: uid(), created_at: at.toISOString() });
}

// ── Evidence & events ─────────────────────────────────────────────────

export async function addEvidence(input: Omit<Evidence, "id" | "created_at">, at: Date) {
  return store().insert("evidence", { ...input, id: uid(), created_at: at.toISOString() });
}

export async function listEvidence(caseId: string) {
  return store().list("evidence", { where: { case_id: caseId }, orderBy: { column: "created_at" } });
}

export async function addEvent(input: Omit<AppEvent, "id" | "created_at">, at?: Date) {
  const when = at ?? (await now(input.project_id));
  return store().insert("event", { ...input, id: uid(), created_at: when.toISOString() });
}

export async function listEvents(opts: { projectId?: string; caseId?: string; limit?: number }) {
  const where: Partial<AppEvent> = {};
  if (opts.caseId) where.case_id = opts.caseId;
  else where.project_id = opts.projectId ?? DEFAULT_PROJECT_ID;
  return store().list("event", { where, orderBy: { column: "created_at", ascending: false }, limit: opts.limit });
}

export async function listDocumentVersions(caseId: string) {
  return store().list("document_version", { where: { case_id: caseId }, orderBy: { column: "version" } });
}

// ── Demo ──────────────────────────────────────────────────────────────

export async function resetDemo() {
  await store().reset(buildSeed(clockNow()));
}
