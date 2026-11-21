// Meetings in the store: one `meeting` row each (see model.ts for the layout).
import "server-only";
import { NotFoundError } from "@/lib/db/store";
import { store } from "@/lib/db";
import { DEFAULT_PROJECT_ID, listCases, uid } from "@/lib/db/repo";
import { berlinDay } from "@/lib/deadlines";
import type { Meeting } from "@/lib/types";
import { emptySteps, MEETING_TYPES, type MeetingItem, type MeetingProtocol, type MeetingType, type MeetingView, type Participant, type Segment } from "./model";

const REF = /^MT-(\d{4})-(\d{4})$/;

export function toView(row: Meeting, caseRefs: Record<string, string> = {}): MeetingView {
  const p = row.protocol as MeetingProtocol;
  const t = row.transcript as { segments?: Segment[] } | null;
  return {
    ...p,
    id: row.id,
    project_id: row.project_id,
    type: (MEETING_TYPES as string[]).includes(row.type) ? (row.type as MeetingType) : "intern",
    audio_url: row.audio_url,
    transcript: (t?.segments ?? []).map(segmentOf),
    items: (p.items ?? []).map(itemOf),
    created_at: row.created_at,
    case_refs: caseRefs,
  };
}

type LegacySegment = Partial<Segment> & { text?: string };
type LegacyItem = Partial<MeetingItem> & { quote?: string };

/** Rows written before meetings were multilingual (German only, one `text`). */
function segmentOf(s: LegacySegment): Segment {
  if (typeof s.text_original === "string") return { notes: [], end_sec: s.start_sec ?? 0, language: null, text_de: null, confidence: null, ...s } as Segment;
  const text = s.text ?? "";
  return { speaker: s.speaker ?? "Sprecher", start_sec: s.start_sec ?? 0, end_sec: s.start_sec ?? 0, language: "de", text_original: text, text_de: text, confidence: null, notes: [] };
}

function itemOf(i: LegacyItem): MeetingItem {
  if (typeof i.quote_de === "string") return i as MeetingItem;
  const q = i.quote ?? "";
  const rest = { ...i };
  delete rest.quote;
  return { ...(rest as MeetingItem), quote_de: q, quote_original: q, quote_language: "de" };
}

/**
 * reference → case id for the cases a meeting points at. A link resolves only
 * when a case with that reference exists AND is of the expected doc type (in a
 * reset demo the same number can later belong to a different letter).
 */
async function caseRefsFor(views: MeetingProtocol[], projectId: string): Promise<Record<string, string>> {
  const wanted = new Map<string, string | undefined>();
  for (const v of views) {
    for (const i of v.items) if (i.case_ref) wanted.set(i.case_ref, i.case_doc_type);
    for (const c of v.changes) if (c.case_ref) wanted.set(c.case_ref, c.case_doc_type);
  }
  if (!wanted.size) return {};
  const out: Record<string, string> = {};
  for (const c of await listCases(projectId)) {
    if (!wanted.has(c.reference)) continue;
    const type = wanted.get(c.reference);
    if (!type || type === c.doc_type) out[c.reference] = c.id;
  }
  return out;
}

export async function listMeetings(projectId = DEFAULT_PROJECT_ID): Promise<MeetingView[]> {
  const rows = await store().list("meeting", { where: { project_id: projectId } });
  const valid = rows.filter((r) => r.protocol && typeof (r.protocol as MeetingProtocol).ref === "string");
  const refs = await caseRefsFor(valid.map((r) => r.protocol as MeetingProtocol), projectId);
  return valid.map((r) => toView(r, refs)).sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export async function getMeeting(id: string): Promise<MeetingView> {
  const row = await store().get("meeting", id);
  if (!row || !row.protocol) throw new NotFoundError("meeting", id);
  const refs = await caseRefsFor([row.protocol as MeetingProtocol], row.project_id);
  return toView(row, refs);
}

export async function requireRow(id: string): Promise<Meeting> {
  const row = await store().get("meeting", id);
  if (!row) throw new NotFoundError("meeting", id);
  return row;
}

/** Next MT-YYYY-NNNN (numbering continues after the seed's 0007). */
export async function nextMeetingRef(at: Date): Promise<string> {
  const year = berlinDay(at).slice(0, 4);
  let max = 5;
  for (const r of await store().list("meeting")) {
    const m = REF.exec(String((r.protocol as MeetingProtocol | null)?.ref ?? ""));
    if (m && m[1] === year) max = Math.max(max, Number(m[2]));
  }
  return `MT-${year}-${String(max + 1).padStart(4, "0")}`;
}

export type NewMeeting = {
  projectId: string;
  title: string;
  type: MeetingType;
  teamId: string | null;
  participants: Participant[];
  consent: boolean;
  source: MeetingProtocol["source"];
};

export async function createMeeting(input: NewMeeting, at: Date): Promise<MeetingView> {
  const protocol: MeetingProtocol = {
    ref: await nextMeetingRef(at),
    title: input.title,
    team_id: input.teamId,
    participants: input.participants,
    consent: input.consent,
    started_at: at.toISOString(),
    ended_at: null,
    duration_sec: 0,
    status: "recording",
    steps: emptySteps(),
    summary: [],
    items: [],
    changes: [],
    notice: null,
    error: null,
    source: input.source,
    mail: null,
    chunks: 0,
  };
  const row = await store().insert("meeting", {
    id: uid(),
    project_id: input.projectId,
    type: input.type,
    audio_url: null,
    transcript: { segments: [] },
    protocol,
    created_at: at.toISOString(),
  });
  return toView(row);
}

/** Patch the protocol (and optionally transcript / audio) of a meeting. */
export async function patchMeeting(
  id: string,
  patch: Partial<MeetingProtocol> & { chunks?: number },
  extra: { transcript?: Segment[]; audio_url?: string | null } = {},
): Promise<Meeting> {
  const row = await requireRow(id);
  return store().update("meeting", id, {
    protocol: { ...(row.protocol as MeetingProtocol), ...patch },
    ...(extra.transcript ? { transcript: { segments: extra.transcript } } : {}),
    ...(extra.audio_url !== undefined ? { audio_url: extra.audio_url } : {}),
  });
}
