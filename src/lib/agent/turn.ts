// /api/agent/turn orchestration (SPEC §6.2). The LLM reads the utterance;
// everything after that is deterministic code: merge facts, route by sphere,
// evaluate, pick the next question (max 3), read back, confirm.
import "server-only";
import { berlinDay } from "@/lib/deadlines";
import { getDocType, hasValue, type DocTypeDef } from "@/lib/doctypes";
import {
  addEvent,
  addEvidence,
  addTurn,
  createCase,
  getCase,
  getConversation,
  getProjectContext,
  listCases,
  listTurns,
  now as clockNow,
  updateCase,
  updateConversation,
  type ProjectContext,
} from "@/lib/db/repo";
import { store } from "@/lib/db";
import { fmtDateTime } from "@/lib/labels";
import { computeSphere, CONFIDENCE_THRESHOLD, evaluateCase, nextQuestionField, routeHindrance } from "@/lib/rules";
import type { Case, Conversation, ConversationState, Turn } from "@/lib/types";
import { after } from "next/server";
import { ensureWeatherEvidence, generateVersion } from "@/lib/documents/generate";
import { extract } from "./extract";
import { llmMode } from "./llm";
import { line, question, readback } from "./phrase";
import type { ExtractContext, ExtractedEvent, Extraction } from "./types";

export type TurnInput = { conversation_id: string; text_original: string; language?: string | null };

export type TurnResult = {
  reply: string;
  reply_language: string;
  intent: Extraction["intent"];
  conversation: Conversation;
  user_turn: Turn;
  klara_turn: Turn;
  cases: Case[];
  ended: boolean;
  llm_mode: "live" | "mock";
};

/** Meta facts (not template fields) kept on the case. */
const META_KEYS = ["trade", "cause_kind", "hired_by", "cost_reservation", "subcontractor_contact_id", "_confidence"];

export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const conv = await getConversation(input.conversation_id);
  if (!conv) throw new Error("Gespräch nicht gefunden");
  if (conv.status === "closed") throw new Error("Gespräch ist beendet");
  const team = await store().get("team", conv.team_id);
  if (!team) throw new Error("Team nicht gefunden");
  const ctx = await getProjectContext(team.project_id);
  const now = await clockNow(team.project_id);
  const user = ctx.users.find((u) => u.id === conv.user_id);
  const teamTrade = ctx.trades.find((t) => t.team_id === team.id)?.name ?? null;

  const state: ConversationState = { ...conv.state, pending_case_ids: conv.state?.pending_case_ids ?? [] };
  const pending = new Map<string, Case>();
  for (const id of state.pending_case_ids) {
    const c = await getCase(id);
    if (c) pending.set(id, c);
  }
  const history = await listTurns(conv.id, 10);

  // ── 1. LLM (or mock) reads the utterance ───────────────────────────
  const askedCase = state.asked ? pending.get(state.asked.case_id) : undefined;
  const exCtx: ExtractContext = {
    nowIso: now.toISOString(),
    nowBerlin: `${fmtDateTime(now)} (${new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Europe/Berlin" }).format(now)})`,
    language: input.language ?? conv.language ?? null,
    projectName: ctx.project.name,
    trades: ctx.trades.map((t) => t.name),
    teamName: team.name,
    teamTrade,
    todaysSchedule: todaysSchedule(ctx, now),
    pendingQuestion:
      state.asked && askedCase
        ? {
            case_ref: askedCase.reference,
            doc_type: askedCase.doc_type,
            field: state.asked.field,
            question_hint: getDocType(askedCase.doc_type)?.fields.find((f) => f.key === state.asked!.field)?.question_hint ?? "",
          }
        : null,
    pendingSphereQuestion: state.asked_sphere ? { trade: state.asked_sphere.trade } : null,
    awaitingConfirm: !!state.awaiting_confirm?.length,
    openCases: [...pending.values()].map((c) => ({
      reference: c.reference,
      doc_type: c.doc_type,
      facts: stripMeta(c.facts),
      missing: c.missing_fields,
    })),
    history: history.map((h) => ({ role: h.role, text: h.text_original })),
  };
  const ex = await extract(input.text_original, exCtx);

  const lang = (ex.reply_language || input.language || conv.language || user?.language || "de").slice(0, 2).toLowerCase();
  const userTurn = await addTurn(
    {
      conversation_id: conv.id,
      role: "user",
      text_original: input.text_original,
      text_de: ex.text_de ?? (lang === "de" ? input.text_original : null),
      language: lang,
      audio_url: null,
    },
    now,
  );

  const notes: string[] = [];
  const touched = new Set<string>();
  let ended = false;
  let action: string | null = null;
  let confirmedCount = 0;
  let needClarify = false;

  // ── 2. End of call ─────────────────────────────────────────────────
  if (ex.intent === "end_call") {
    ended = true;
    action = await line("goodbye", lang);
  }

  // ── 3. Answers and corrections ─────────────────────────────────────
  const answers = { ...(ex.answer_facts ?? {}) };
  if (!ended && state.asked_sphere && (answers.hired_by === "client" || answers.hired_by === "us")) {
    const c = pending.get(state.asked_sphere.case_id);
    if (c) {
      c.facts.hired_by = answers.hired_by;
      const res = await rerouteHindrance(c, ctx, lang, notes);
      if (res === "removed") pending.delete(c.id);
      touched.add(c.id);
    }
    state.asked_sphere = null;
    delete answers.hired_by;
  }
  if (!ended && (Object.keys(answers).length || ex.declined_fields?.length)) {
    const ordered = [...pending.values()].sort((a, b) => (a.id === state.asked?.case_id ? -1 : b.id === state.asked?.case_id ? 1 : 0));
    for (const [key, value] of Object.entries(answers)) {
      if (value === null || value === undefined || value === "") continue;
      for (const c of ordered) {
        const def = getDocType(c.doc_type);
        if (!def?.fields.some((f) => f.key === key)) continue;
        const isAsked = c.id === state.asked?.case_id && key === state.asked?.field;
        if (isAsked || !hasValue(c.facts[key]) || ex.intent === "deny") {
          c.facts[key] = value;
          touched.add(c.id);
        }
      }
    }
    for (const key of ex.declined_fields ?? []) {
      for (const c of ordered) {
        if (getDocType(c.doc_type)?.fields.some((f) => f.key === key) && !c.declined_fields.includes(key)) {
          c.declined_fields = [...c.declined_fields, key];
          touched.add(c.id);
        }
      }
    }
    state.asked = null;
  }

  // ── 4. Confirmation of a readback ─────────────────────────────────
  if (!ended && state.awaiting_confirm?.length) {
    if (ex.intent === "confirm") {
      for (const id of state.awaiting_confirm) {
        const c = pending.get(id);
        if (!c) continue;
        await finalizeCase(c, ctx, conv, now);
        pending.delete(id);
        confirmedCount++;
      }
      state.awaiting_confirm = null;
    } else if (ex.intent === "deny" && !Object.keys(answers).length) {
      action = await line("denyAsk", lang);
    } else if (Object.keys(answers).length) {
      state.awaiting_confirm = null; // corrected → read back again below
    }
  }

  // ── 5. New events ─────────────────────────────────────────────────
  if (!ended) {
    const created = await handleEvents(ex.events, { ctx, conv, now, pending, notes, lang, teamTrade });
    created.forEach((id) => touched.add(id));
    needClarify = ex.events.some((e) => e.doc_type === "none" || e.confidence < CONFIDENCE_THRESHOLD) && created.length === 0 && !notes.length;
  }

  // ── 6. Re-evaluate touched cases ──────────────────────────────────
  for (const id of touched) {
    const c = pending.get(id);
    if (c) pending.set(id, await persistEvaluation(c, ctx, now));
  }

  // ── 7. Next action: sphere question → field question → readback ──
  if (!ended && !action) {
    const open = [...pending.values()];
    const unclear = open.find((c) => c.sphere === "unclear" && c.doc_type === "behinderungsanzeige");
    if (unclear && !state.asked_sphere) {
      state.asked_sphere = { case_id: unclear.id, trade: (unclear.facts.trade as string) ?? "" };
      action = unclear.facts.trade
        ? await line("askSphere", lang, { trade: String(unclear.facts.trade) })
        : await line("askSphereUnknown", lang);
    }
    if (!action && !state.awaiting_confirm?.length) {
      for (const c of open) {
        const def = getDocType(c.doc_type)!;
        const field = nextQuestionField(def, c.facts, c.asked_fields, c.declined_fields);
        if (field) {
          state.asked = { case_id: c.id, field };
          // Shared fields (e.g. instruction_date) count as asked for every sibling case.
          for (const s of open) {
            if (getDocType(s.doc_type)?.fields.some((f) => f.key === field) && !s.asked_fields.includes(field)) {
              s.asked_fields = [...s.asked_fields, field];
              await updateCase(s.id, { asked_fields: s.asked_fields });
            }
          }
          action = await question(c.doc_type, field, lang);
          break;
        }
      }
    }
    if (!action && open.length && !state.awaiting_confirm?.length) {
      state.awaiting_confirm = open.map((c) => c.id);
      action = await readback(open, lang);
    }
    if (!action && confirmedCount) {
      action = await line(confirmedCount > 1 ? "createdMany" : "created", lang, { n: confirmedCount });
    }
    if (!action && needClarify) action = await line("clarify", lang);
    if (!action && !notes.length) action = await line(ex.intent === "smalltalk" ? "smalltalk" : "stillThere", lang);
  } else if (!ended && confirmedCount && action) {
    notes.unshift(await line(confirmedCount > 1 ? "createdMany" : "created", lang, { n: confirmedCount }));
  }

  const reply = [...notes, action].filter(Boolean).join(" ");
  const klaraTurn = await addTurn(
    { conversation_id: conv.id, role: "klara", text_original: reply, text_de: lang === "de" ? reply : null, language: lang, audio_url: null },
    new Date(now.getTime() + 1),
  );

  state.pending_case_ids = [...pending.keys()];
  const updatedConv = await updateConversation(conv.id, {
    state,
    language: conv.language ?? lang,
    ...(ended ? { status: "closed" as const, ended_at: now.toISOString() } : {}),
  });

  const cases: Case[] = [];
  const allIds = new Set([...touched, ...state.pending_case_ids]);
  for (const id of allIds) {
    const c = await getCase(id);
    if (c) cases.push(c);
  }
  if (ended) await addEvent({ project_id: ctx.project.id, case_id: null, kind: "call_ended", payload: { conversation_id: conv.id } }, now);

  return {
    reply,
    reply_language: lang,
    intent: ex.intent,
    conversation: updatedConv,
    user_turn: userTurn,
    klara_turn: klaraTurn,
    cases,
    ended,
    llm_mode: llmMode(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function stripMeta(facts: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(facts).filter(([k]) => !META_KEYS.includes(k)));
}

function todaysSchedule(ctx: ProjectContext, now: Date): string[] {
  const today = berlinDay(now);
  return ctx.schedule
    .filter((s) => s.start_date <= today && s.end_date >= today)
    .map((s) => {
      const trade = ctx.trades.find((t) => t.id === s.trade_id)?.name ?? "";
      const rate = s.planned_per_day ? ` (${s.planned_per_day} ${s.unit}/Tag)` : "";
      return `${trade} ${s.area}: ${s.activity}${rate}`;
    });
}

function pickFacts(def: DocTypeDef, facts: Record<string, unknown>): Record<string, unknown> {
  const keys = new Set([...def.fields.map((f) => f.key), ...META_KEYS]);
  return Object.fromEntries(Object.entries(facts).filter(([k, v]) => keys.has(k) && hasValue(v)));
}

type EventCtx = {
  ctx: ProjectContext;
  conv: Conversation;
  now: Date;
  pending: Map<string, Case>;
  notes: string[];
  lang: string;
  teamTrade: string | null;
};

async function newCase(docType: string, facts: Record<string, unknown>, e: EventCtx, extra: Partial<Case> = {}): Promise<Case> {
  const def = getDocType(docType)!;
  // Same doc type already open in this conversation → merge instead of duplicating.
  const existing = [...e.pending.values()].find((c) => c.doc_type === docType);
  if (existing) {
    for (const [k, v] of Object.entries(pickFacts(def, facts))) if (!hasValue(existing.facts[k])) existing.facts[k] = v;
    return existing;
  }
  const c = await createCase({
    project_id: e.ctx.project.id,
    team_id: e.conv.team_id,
    conversation_id: e.conv.id,
    doc_type: docType,
    status: "entwurf",
    sphere: null,
    facts: pickFacts(def, facts),
    missing_fields: [],
    checks: [],
    deadline_at: null,
    deadline_rule: null,
    parent_case_id: null,
    created_by: e.conv.user_id,
    asked_fields: [],
    declined_fields: [],
    flags: [],
    created_at: e.now.toISOString(),
    ...extra,
  });
  e.pending.set(c.id, c);
  await addEvent(
    { project_id: e.ctx.project.id, case_id: c.id, kind: "case_created", payload: { reference: c.reference, doc_type: docType } },
    e.now,
  );
  return c;
}

async function diaryEntry(e: EventCtx, entry: Record<string, unknown>) {
  const date = berlinDay(e.now);
  const existing = (await store().list("daily_report", { where: { team_id: e.conv.team_id, date } }))[0];
  if (existing) {
    const entries = Array.isArray(existing.data.entries) ? existing.data.entries : [];
    await store().update("daily_report", existing.id, { data: { ...existing.data, entries: [...entries, entry] } });
  } else {
    await store().insert("daily_report", {
      id: crypto.randomUUID(),
      team_id: e.conv.team_id,
      date,
      data: { entries: [entry] },
      status: "entwurf",
      missing_fields: [],
    });
  }
  await addEvent({ project_id: e.ctx.project.id, case_id: null, kind: "diary_entry", payload: { team_id: e.conv.team_id, ...entry } }, e.now);
}

async function handleEvents(events: ExtractedEvent[], e: EventCtx): Promise<string[]> {
  const created: string[] = [];
  const types = new Set(events.map((x) => x.doc_type));
  for (const ev of events) {
    if (ev.doc_type === "none" || ev.confidence < CONFIDENCE_THRESHOLD) continue;
    const facts: Record<string, unknown> = { ...ev.facts, _confidence: ev.confidence };

    if (ev.doc_type === "diary_only") {
      await diaryEntry(e, { kind: "note", text: ev.facts.note ?? null, at: e.now.toISOString() });
      e.notes.push(await line("diaryNoted", e.lang));
      continue;
    }

    if (ev.doc_type === "behinderungsanzeige") {
      const s = computeSphere({ causeKind: ev.cause_kind ?? "unknown", tradeGuess: ev.trade_name_guess ?? null }, e.ctx);
      // The reporting team's own trade cannot be the cause of its own hindrance.
      const sphere = s.trade && s.trade.team_id === e.conv.team_id && ev.cause_kind !== "weather" ? "unclear" : s.sphere;
      facts.trade = s.tradeName ?? undefined;
      facts.cause_kind = ev.cause_kind ?? "unknown";
      const route = routeHindrance(sphere, s.tradeName);
      if (route.kind === "diary") {
        await diaryEntry(e, { kind: "hindrance_own_team", text: ev.facts.cause ?? null, trade: s.tradeName, at: e.now.toISOString() });
        await addEvent({ project_id: e.ctx.project.id, case_id: null, kind: "risk_flag", payload: { reason_de: "Hinweis: vermutlich eigene Sphäre (eigene Kolonne) – interner Vermerk", trade: s.tradeName } }, e.now);
        e.notes.push(await line("ownTeamNoted", e.lang));
        continue;
      }
      if (route.kind === "letter" && route.doc_type === "verzug_nu") {
        facts.subcontractor_contact_id = s.trade?.contact_id ?? null;
        const c = await newCase("verzug_nu", facts, e, { sphere: "own_sub", flags: ["internal_risk"] });
        created.push(c.id);
        e.notes.push(await line("subcontractorNote", e.lang, { trade: s.tradeName ?? "" }));
        continue;
      }
      facts.cost_reservation = route.kind === "letter" ? route.cost_reservation : true;
      const c = await newCase("behinderungsanzeige", facts, e, { sphere });
      created.push(c.id);
      continue;
    }

    if (ev.doc_type === "behinderung_ende") {
      const open = (await listCases(e.ctx.project.id)).find(
        (c) => c.doc_type === "behinderungsanzeige" && c.team_id === e.conv.team_id && c.status !== "abgeschlossen",
      );
      const c = await newCase("behinderung_ende", facts, e, { parent_case_id: open?.id ?? null, sphere: open?.sphere ?? null });
      created.push(c.id);
      continue;
    }

    if (ev.doc_type === "mehrkostenanzeige" || ev.doc_type === "anordnung_bestaetigung") {
      const c = await newCase(ev.doc_type, facts, e);
      created.push(c.id);
      // A verbal instruction always also gets an Anordnungsbestätigung (SPEC §5.2).
      if (ev.doc_type === "mehrkostenanzeige" && !types.has("anordnung_bestaetigung") && ev.facts.verbal !== false) {
        const a = await newCase(
          "anordnung_bestaetigung",
          { ...facts, instruction_text: ev.facts.instruction_text ?? ev.facts.description },
          e,
        );
        created.push(a.id);
      }
      continue;
    }

    // Recognised but not built yet (should/could types): flag for the office.
    await addEvent(
      { project_id: e.ctx.project.id, case_id: null, kind: "unsupported_event", payload: { doc_type: ev.doc_type, facts: ev.facts } },
      e.now,
    );
    e.notes.push(await line("ownTeamNoted", e.lang));
  }
  return created;
}

async function rerouteHindrance(c: Case, ctx: ProjectContext, lang: string, notes: string[]): Promise<"kept" | "removed"> {
  const s = computeSphere(
    { causeKind: "trade", tradeGuess: (c.facts.trade as string) ?? null, hiredBy: c.facts.hired_by as "client" | "us" },
    ctx,
  );
  if (s.sphere === "client") {
    c.sphere = "client";
    c.facts.cost_reservation = true;
    return "kept";
  }
  // Our subcontractor → Abhilfeaufforderung instead of a Behinderungsanzeige.
  c.doc_type = "verzug_nu";
  c.sphere = "own_sub";
  c.flags = [...new Set([...c.flags, "internal_risk"])];
  await updateCase(c.id, { doc_type: c.doc_type, sphere: c.sphere, flags: c.flags });
  notes.push(await line("subcontractorNote", lang, { trade: String(c.facts.trade ?? "") }));
  return "kept";
}

async function persistEvaluation(c: Case, ctx: ProjectContext, now: Date): Promise<Case> {
  const def = getDocType(c.doc_type)!;
  const ev = evaluateCase(
    {
      def,
      facts: c.facts,
      sphere: c.sphere,
      declinedFields: c.declined_fields,
      confidence: typeof c.facts._confidence === "number" ? c.facts._confidence : null,
      now,
      subcontractorContactId: (c.facts.subcontractor_contact_id as string) ?? null,
    },
    ctx,
  );
  return updateCase(c.id, {
    doc_type: c.doc_type,
    sphere: c.sphere,
    facts: c.facts,
    declined_fields: c.declined_fields,
    missing_fields: ev.missing_fields,
    checks: ev.checks,
    deadline_at: ev.deadline.due_at,
    deadline_rule: ev.deadline_rule,
    flags: [...new Set([...c.flags, ...ev.flags])],
  });
}

async function finalizeCase(c: Case, ctx: ProjectContext, conv: Conversation, now: Date) {
  const updated = await persistEvaluation(c, ctx, now);
  const status = updated.missing_fields.length ? "unvollstaendig" : "bereit";
  const finalCase = await updateCase(c.id, { status });
  const turns = await listTurns(conv.id);
  await addEvidence(
    {
      case_id: c.id,
      kind: "transcript",
      ref: conv.id,
      data: {
        language: conv.language,
        turns: turns.map((t) => ({ role: t.role, at: t.created_at, text: t.text_original, text_de: t.text_de })),
      },
    },
    now,
  );
  await addEvent(
    {
      project_id: ctx.project.id,
      case_id: c.id,
      kind: "case_confirmed",
      payload: { reference: c.reference, doc_type: c.doc_type, status, flags: updated.flags },
    },
    now,
  );
  // German document v1 (PDF + DOCX are rendered from it on demand).
  await generateVersion(c.id);
  // Weather of the event day as evidence; never block the call on the network.
  const weather = () => ensureWeatherEvidence(finalCase).catch(() => {});
  try {
    after(weather);
  } catch {
    void weather();
  }
}
