// One conversation turn (SPEC §6.2). The LLM (or the keyword mock) only reads
// the utterance; everything after that is deterministic code:
//   merge facts into the open case or create one → rules engine → next question
//   (max 3 per case) → readback → confirm → status bereit / unvollständig.
// Klara's line is built from parts so the same reply exists in the user's
// language and in German (subtitle and office view).
import "server-only";
import { BadRequestError } from "@/lib/api";
import { clockBase, withOffset } from "@/lib/clock";
import { store } from "@/lib/db";
import {
  addDiaryEntry,
  addEvent,
  addEvidence,
  addTurn,
  createCase,
  getConversation,
  getProjectContext,
  holidayRegion,
  listCases,
  listTurns,
  toCaseViews,
  updateCase,
  updateConversation,
  upsertProgress,
  type NewCase,
  type ProjectContext,
} from "@/lib/db/repo";
import { NotFoundError } from "@/lib/db/store";
import { addWerktage, berlinDay, TZ, werktageBetween } from "@/lib/deadlines";
import { getDocType, hasValue, NOT_BUILT_DE, requireDocType } from "@/lib/doctypes";
import { fmtNumber } from "@/lib/labels";
import {
  canonicalTradeName,
  computeSphere,
  CONFIDENCE_THRESHOLD,
  dependents,
  evaluateCase,
  eventTime,
  nextQuestionField,
  planVsActual,
  resolveTrade,
  routeHindrance,
  type CauseKind,
} from "@/lib/rules";
import type { AppUser, Case, Conversation, ConversationState, ScheduleItem, Sphere, Team, Trade, Turn } from "@/lib/types";
import { generateDocument } from "@/lib/documents/generate";
import { fetchWeather, type WeatherRecord } from "@/lib/weather";
import { extract } from "./extract";
import type { LineKey } from "./lines";
import { line, question, readback, readbackView } from "./phrase";
import type { ExtractContext, ExtractedEvent, Extraction, Intent, TurnResponse } from "./types";

type Part =
  | { kind: "line"; key: LineKey; vars?: Record<string, string | number>; varsDe?: Record<string, string | number> }
  | { kind: "question"; docType: string; field: string }
  | { kind: "readback"; caseIds: string[] };

export type TurnInput = {
  conversationId: string;
  text: string;
  /** Language from speech recognition; null/"auto" = detect. */
  language?: string | null;
  /** Override of the demo clock (tests). */
  now?: Date;
};

/** Flags the rules engine recomputes on every evaluation. */
const EVALUATED_FLAGS = new Set(["escalate", "internal_risk"]);
/** Documents that carry the site weather as evidence. */
const WEATHER_DOC_TYPES = new Set(["behinderungsanzeige"]);

const nowBerlinFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const publicFacts = (facts: Record<string, unknown>) => Object.fromEntries(Object.entries(facts).filter(([k]) => !k.startsWith("_")));
const tradeKey = (guess: string | null) => (canonicalTradeName(guess) ?? "").toLowerCase();

export async function runTurn(input: TurnInput): Promise<TurnResponse> {
  const text = input.text.trim();
  if (!text) throw new BadRequestError("Text fehlt");
  const conv = await getConversation(input.conversationId);
  if (!conv) throw new NotFoundError("conversation", input.conversationId);
  if (conv.status === "closed") throw new BadRequestError("Das Gespräch ist bereits beendet");
  const team = await store().get("team", conv.team_id);
  if (!team) throw new NotFoundError("team", conv.team_id);
  const ctx = await getProjectContext(team.project_id);
  const now = input.now ?? withOffset(clockBase(), ctx.project.settings.demo_clock_offset_ms);
  return new TurnRun(ctx, conv, team, now).run(text, input.language ?? null);
}

class TurnRun {
  private readonly today: string;
  private readonly region: string;
  private readonly teamTrade: Trade | null;
  private readonly user: AppUser | null;
  private state: ConversationState;
  private pending: Case[] = [];
  private readonly cases = new Map<string, Case>();
  private readonly touched = new Set<string>();
  private readonly parts: Part[] = [];
  private userText = "";
  private userTextDe: string | null = null;
  private ended = false;

  constructor(
    private readonly ctx: ProjectContext,
    private readonly conv: Conversation,
    private readonly team: Team,
    private readonly now: Date,
  ) {
    this.today = berlinDay(now);
    this.region = holidayRegion(ctx.project);
    this.teamTrade = ctx.trades.find((t) => t.team_id === team.id) ?? null;
    this.user = ctx.users.find((u) => u.id === conv.user_id) ?? null;
    const s = conv.state ?? { pending_case_ids: [] };
    this.state = { ...s, pending_case_ids: [...(s.pending_case_ids ?? [])] };
  }

  async run(text: string, langHint: string | null): Promise<TurnResponse> {
    const hint = langHint && langHint !== "auto" ? langHint : null;
    const loaded = await Promise.all(this.state.pending_case_ids.map((id) => store().get("case", id)));
    // Drafts, plus cases the office sent back for completion ("Zurück zur Ergänzung").
    this.pending = loaded.filter((c): c is Case => !!c && (c.status === "entwurf" || c.flags.includes("returned")));
    this.state.pending_case_ids = this.pending.map((c) => c.id);
    for (const c of this.pending) this.cases.set(c.id, c);

    const [history, convCases] = await Promise.all([listTurns(this.conv.id, 10), this.documentedCases()]);
    const { extraction: ex, source } = await extract(text, this.extractContext(history, convCases, hint));

    const words = text.split(/\s+/).length;
    const lang = hint ?? (this.conv.language && words < 4 ? this.conv.language : ex.reply_language) ?? this.conv.language ?? "de";
    this.userText = text;
    this.userTextDe = lang === "de" ? text : ex.text_de;

    const userTurn = await addTurn(
      { conversation_id: this.conv.id, role: "user", text_original: text, text_de: this.userTextDe, language: lang, audio_url: null },
      this.now,
    );

    await this.handle(ex);

    if (!this.parts.length) this.parts.push({ kind: "line", key: "smalltalk" });
    const [reply, replyDe] = await Promise.all([this.render(lang), lang === "de" ? null : this.render("de")]);
    const klaraTurn = await addTurn(
      { conversation_id: this.conv.id, role: "klara", text_original: reply, text_de: replyDe ?? reply, language: lang, audio_url: null },
      new Date(this.now.getTime() + 1),
    );

    const closing = this.ended && this.conv.kind === "call";
    await updateConversation(this.conv.id, {
      state: this.state,
      language: lang,
      ...(closing ? { status: "closed" as const, ended_at: this.now.toISOString() } : {}),
    });

    const touched = [...this.touched].map((id) => this.cases.get(id)).filter((c): c is Case => !!c);
    return {
      reply,
      reply_de: replyDe ?? reply,
      language: lang,
      intent: ex.intent,
      source,
      user_turn: userTurn,
      klara_turn: klaraTurn,
      cases: await toCaseViews(touched, this.ctx),
      awaiting_confirm: !!this.state.awaiting_confirm?.length,
      confirm: this.state.awaiting_confirm?.length
        ? readbackView(
            this.state.awaiting_confirm.map((id) => this.cases.get(id)).filter((c): c is Case => !!c),
            lang,
            this.now,
          )
        : null,
      question: this.state.asked ?? null,
      ended: this.ended,
    };
  }

  // ── Context for the extractor ───────────────────────────────────────

  private async documentedCases(): Promise<Case[]> {
    const all = await listCases(this.ctx.project.id);
    return all.filter((c) => c.conversation_id === this.conv.id && c.status !== "entwurf" && !c.flags.includes("returned"));
  }

  private todaysItems(): ScheduleItem[] {
    return this.ctx.schedule.filter((s) => s.start_date <= this.today && this.today <= s.end_date);
  }

  private tradeName(id: string): string {
    return this.ctx.trades.find((t) => t.id === id)?.name ?? "";
  }

  private extractContext(history: Turn[], documented: Case[], hint: string | null): ExtractContext {
    const asked = this.state.asked ? this.cases.get(this.state.asked.case_id) : null;
    const askedField = asked ? getDocType(asked.doc_type)?.fields.find((f) => f.key === this.state.asked!.field) : null;
    return {
      nowIso: this.now.toISOString(),
      nowBerlin: nowBerlinFmt.format(this.now),
      language: this.conv.language ?? hint,
      projectName: this.ctx.project.name,
      trades: this.ctx.trades.map((t) => t.name),
      teamName: this.team.name,
      teamTrade: this.teamTrade?.name ?? null,
      todaysSchedule: this.todaysItems().map((s) => `${this.tradeName(s.trade_id)}: ${s.activity}, ${s.area} (${s.start_date} – ${s.end_date})`),
      openCases: this.pending.map((c) => ({ reference: c.reference, doc_type: c.doc_type, facts: publicFacts(c.facts), missing: c.missing_fields })),
      documented: documented.map((c) => ({ reference: c.reference, doc_type: c.doc_type })),
      pendingQuestion:
        asked && askedField
          ? { case_ref: asked.reference, doc_type: asked.doc_type, field: askedField.key, question_hint: askedField.question_hint }
          : null,
      pendingSphereQuestion: this.state.asked_sphere ? { trade: this.state.asked_sphere.trade } : null,
      awaitingConfirm: !!this.state.awaiting_confirm?.length,
      history: history.map((t) => ({ role: t.role, text: t.text_original })),
    };
  }

  // ── Flow ─────────────────────────────────────────────────────────────

  private async handle(ex: Extraction): Promise<void> {
    const intent: Intent = ex.intent;
    if (intent === "end_call") return this.endCall();
    if (intent === "confirm" && this.state.awaiting_confirm?.length) return this.confirm();
    if (intent === "deny" && this.state.awaiting_confirm?.length && !Object.keys(ex.answers).length && !ex.events.length) {
      this.parts.push({ kind: "line", key: "denyAsk" });
      return;
    }

    const results = [
      await this.applyAnswers(ex),
      await this.applyHiredBy(ex),
      await this.applyEvents(ex),
      await this.applyDiary(ex),
      await this.applyProgress(ex),
    ];
    if (!results.some(Boolean)) return this.noProgress(ex);
    this.state.clarify_count = 0;
    await this.next();
  }

  /** Ask the next missing fact, or read everything back for confirmation. */
  private async next(): Promise<void> {
    const sphereQ = this.state.asked_sphere;
    if (sphereQ && this.cases.has(sphereQ.case_id)) {
      this.state.asked = null;
      this.state.awaiting_confirm = null;
      this.parts.push(
        sphereQ.trade
          ? {
              kind: "line",
              key: "askSphere",
              vars: { trade: sphereQ.trade },
              varsDe: { trade: canonicalTradeName(sphereQ.trade) ?? sphereQ.trade },
            }
          : { kind: "line", key: "askSphereUnknown" },
      );
      return;
    }

    for (const c of this.pending) {
      const def = requireDocType(c.doc_type);
      const field = nextQuestionField(def, c.facts, c.asked_fields, c.declined_fields);
      if (!field) continue;
      // One question serves every open case that needs the same fact (Mehrkosten + Anordnung).
      for (const o of this.pending) {
        const needs = requireDocType(o.doc_type).fields.some((f) => f.key === field) && !hasValue(o.facts[field]);
        if (needs && !o.asked_fields.includes(field)) await this.save(o, { asked_fields: [...o.asked_fields, field] });
      }
      this.state.asked = { case_id: c.id, field };
      this.state.awaiting_confirm = null;
      this.parts.push({ kind: "question", docType: c.doc_type, field });
      return;
    }

    this.state.asked = null;
    if (this.pending.length) {
      this.state.awaiting_confirm = this.pending.map((c) => c.id);
      this.parts.push({ kind: "readback", caseIds: this.pending.map((c) => c.id) });
    } else {
      this.state.awaiting_confirm = null;
    }
  }

  private async noProgress(ex: Extraction): Promise<void> {
    const weak = ex.events.filter((e) => e.doc_type !== "none");
    if (weak.length) this.state.tentative = mergeTentative(this.state.tentative ?? null, weak);

    const misses = (this.state.clarify_count ?? 0) + 1;
    this.state.clarify_count = misses;

    // An open question that was not answered: ask once more, then move on.
    if (this.state.asked && this.cases.has(this.state.asked.case_id)) {
      const { case_id, field } = this.state.asked;
      if (misses >= 2) {
        const c = this.cases.get(case_id)!;
        await this.save(c, { declined_fields: [...c.declined_fields, field] });
        this.state.clarify_count = 0;
        return this.next();
      }
      this.parts.push({ kind: "question", docType: this.cases.get(case_id)!.doc_type, field });
      return;
    }
    if (this.state.awaiting_confirm?.length) {
      this.parts.push({ kind: "line", key: "readbackOutro" });
      return;
    }
    if (this.state.asked_sphere) {
      if (misses >= 2) {
        // Still unclear: leave the sphere open (amber) for the site manager.
        this.state.hired_by = { ...this.state.hired_by, [tradeKey(this.state.asked_sphere.trade)]: "unknown" };
        this.state.asked_sphere = null;
        this.state.clarify_count = 0;
      }
      return this.next();
    }

    if (ex.intent === "smalltalk" && !weak.length && !ex.events.length) {
      this.parts.push({ kind: "line", key: "smalltalk" });
      return;
    }
    // SPEC §6.2 step 3: low confidence → clarifying question, no case. After two tries, note it for the office.
    if (misses >= 3) {
      const note = this.userTextDe ?? this.userText;
      await addDiaryEntry(this.team.id, this.today, { kind: "note", text: `Unklare Meldung: ${note}`, at: this.now.toISOString() });
      await addEvent(
        { project_id: this.ctx.project.id, case_id: null, kind: "diary_entry", payload: { text: `Unklare Meldung: ${note}`, team_id: this.team.id } },
        this.now,
      );
      this.state.clarify_count = 0;
      this.state.tentative = null;
      this.parts.push({ kind: "line", key: "clarifyGiveUp" });
      return;
    }
    this.parts.push({ kind: "line", key: "clarify" });
  }

  /** Site weather at each hindrance's event time (SPEC §5.2 computed `weather`); lookups shared per instant. */
  private async weatherFor(cases: Case[]): Promise<Map<string, WeatherRecord>> {
    const out = new Map<string, WeatherRecord>();
    const { lat, lng } = this.ctx.project;
    const byInstant = new Map<string, Promise<WeatherRecord | null>>();
    await Promise.all(
      cases
        .filter((c) => WEATHER_DOC_TYPES.has(c.doc_type))
        .map(async (c) => {
          const at = eventTime(requireDocType(c.doc_type), c.facts, this.now);
          const key = at.toISOString().slice(0, 13);
          if (!byInstant.has(key)) byInstant.set(key, fetchWeather(lat, lng, at));
          const w = await byInstant.get(key)!;
          if (w) out.set(c.id, w);
        }),
    );
    return out;
  }

  private async confirm(): Promise<void> {
    const ids = new Set(this.state.awaiting_confirm ?? []);
    const confirmed = this.pending.filter((c) => ids.has(c.id));
    const transcript = (await listTurns(this.conv.id)).map((t) => ({
      role: t.role,
      text: t.text_original,
      text_de: t.text_de,
      language: t.language,
      at: t.created_at,
    }));
    const weather = await this.weatherFor(confirmed);
    let incomplete = 0;
    for (const c of confirmed) {
      const status = c.missing_fields.length ? "unvollstaendig" : "bereit";
      if (status === "unvollstaendig") incomplete++;
      const w = weather.get(c.id) ?? null;
      // The card follows Klara's confirming line (user turn at now, Klara at now + 1 ms).
      const saved = await this.save(c, {
        status,
        flags: c.flags.filter((f) => f !== "returned"),
        facts: {
          _confirmed_at: new Date(this.now.getTime() + 2).toISOString(),
          ...(w ? { _weather: { summary_de: w.summary_de, unusual: w.unusual } } : {}),
        },
      });
      if (w) await addEvidence({ case_id: c.id, kind: "weather", ref: w.source, data: { ...w } }, this.now);
      await this.makeDocument(saved);
      await addEvidence(
        { case_id: c.id, kind: "transcript", ref: this.conv.id, data: { conversation_id: this.conv.id, kind: this.conv.kind, turns: transcript } },
        this.now,
      );
      await addEvent(
        {
          project_id: this.ctx.project.id,
          case_id: c.id,
          kind: "case_confirmed",
          payload: { reference: c.reference, doc_type: c.doc_type, status, by: this.user?.name ?? null },
        },
        this.now,
      );
      if (saved.flags.includes("escalate")) {
        await addEvent(
          {
            project_id: this.ctx.project.id,
            case_id: c.id,
            kind: "risk_flag",
            payload: { reference: c.reference, reason_de: "Ankündigung vor Ausführung versäumt – bitte Bauleitung einbinden" },
          },
          this.now,
        );
      }
    }
    this.pending = this.pending.filter((c) => !ids.has(c.id));
    this.state.pending_case_ids = this.pending.map((c) => c.id);
    this.state.awaiting_confirm = null;
    this.state.asked = null;
    this.state.clarify_count = 0;

    const n = confirmed.length;
    if (n > 1) this.parts.push({ kind: "line", key: "createdMany", vars: { n } });
    else this.parts.push({ kind: "line", key: incomplete ? "createdIncomplete" : "created" });
  }

  /** SPEC §6.2 step 6: version 1 of the letter (PDF + DOCX are rendered from it). A failure never breaks the call. */
  private async makeDocument(c: Case): Promise<void> {
    try {
      await generateDocument(c.id, this.now);
    } catch (err) {
      console.error("[klara] document generation failed", c.reference, err);
    }
  }

  private async endCall(): Promise<void> {
    if (this.pending.length) {
      for (const c of this.pending) {
        await this.save(c, { status: "unvollstaendig", flags: [...c.flags, "unconfirmed"] });
      }
      this.parts.push({ kind: "line", key: "unconfirmedSaved" });
    }
    await addEvent(
      {
        project_id: this.ctx.project.id,
        case_id: null,
        kind: "call_ended",
        payload: {
          conversation_id: this.conv.id,
          team_id: this.team.id,
          summary_de: this.pending.length
            ? `${this.pending.length} Vorgang ohne Bestätigung gespeichert`
            : this.conv.kind === "call"
              ? "Anruf beendet"
              : "Unterhaltung beendet",
        },
      },
      this.now,
    );
    this.pending = [];
    this.state = { pending_case_ids: [], hired_by: this.state.hired_by };
    this.parts.push({ kind: "line", key: "goodbye" });
    this.ended = true;
  }

  // ── Applying what the user said ─────────────────────────────────────

  private async applyAnswers(ex: Extraction): Promise<boolean> {
    const entries = Object.entries(ex.answers);
    if (!entries.length && !ex.declined_fields.length) return false;
    let changed = false;
    for (const c of [...this.pending]) {
      const fields = requireDocType(c.doc_type).fields;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of entries) {
        if (!fields.some((f) => f.key === k)) continue;
        const answersAsked = this.state.asked?.field === k;
        // The asked case takes the answer; other cases only fill a gap. Anything else is a correction.
        if (!answersAsked || this.state.asked?.case_id === c.id || !hasValue(c.facts[k])) patch[k] = v;
      }
      const declined = ex.declined_fields.filter(
        (k) => fields.some((f) => f.key === k) && !hasValue(c.facts[k]) && !c.declined_fields.includes(k),
      );
      if (!Object.keys(patch).length && !declined.length) continue;
      const inferred = Array.isArray(c.facts._inferred) ? (c.facts._inferred as string[]).filter((k) => !(k in patch)) : undefined;
      await this.save(c, {
        facts: { ...c.facts, ...patch, ...(inferred ? { _inferred: inferred } : {}) },
        declined_fields: [...c.declined_fields, ...declined],
      });
      changed = true;
    }
    return changed;
  }

  private async applyHiredBy(ex: Extraction): Promise<boolean> {
    const q = this.state.asked_sphere;
    if (!q || !ex.hired_by) return false;
    this.state.asked_sphere = null;
    this.state.hired_by = { ...this.state.hired_by, [tradeKey(q.trade)]: ex.hired_by };
    const c = this.cases.get(q.case_id);
    if (!c || ex.hired_by === "unknown") return true;
    const sp = computeSphere({ causeKind: "trade", tradeGuess: q.trade, hiredBy: ex.hired_by, reportingTeamId: this.team.id }, this.ctx);
    await this.routeHindranceCase(c, sp.sphere, sp.trade, sp.tradeName);
    return true;
  }

  private async applyEvents(ex: Extraction): Promise<boolean> {
    const real = ex.events.filter((e) => e.doc_type !== "none");
    const strong = real.filter((e) => e.confidence >= CONFIDENCE_THRESHOLD);
    if (!strong.length) return false;

    // A low-confidence report from the turn before completes the first matching event.
    const tentative = this.state.tentative;
    if (tentative) {
      const target = strong.find((e) => e.doc_type === tentative.doc_type);
      if (target) {
        target.facts = { ...tentative.facts, ...target.facts };
        target.trade_name_guess ??= tentative.trade_name_guess;
        if (target.cause_kind === "unknown") target.cause_kind = tentative.cause_kind as CauseKind;
      }
      this.state.tentative = null;
    }

    for (const ev of withVerbalConfirmation(strong)) await this.openEvent(ev);
    return true;
  }

  private async applyDiary(ex: Extraction): Promise<boolean> {
    if (!ex.diary_note) return false;
    await addDiaryEntry(this.team.id, this.today, { kind: "note", text: ex.diary_note, at: this.now.toISOString(), by: this.user?.name ?? null });
    await addEvent(
      { project_id: this.ctx.project.id, case_id: null, kind: "diary_entry", payload: { text: ex.diary_note, team_id: this.team.id } },
      this.now,
    );
    this.parts.push({ kind: "line", key: "diaryNoted" });
    return true;
  }

  /** Evening report: quantity per schedule item → plan vs actual → notice to follow-up trades (SPEC §10.6). */
  private async applyProgress(ex: Extraction): Promise<boolean> {
    let any = false;
    for (const p of ex.progress) {
      const trade = resolveTrade(p.trade, this.ctx.trades) ?? this.teamTrade;
      if (!trade) continue;
      const candidates = this.ctx.schedule.filter((s) => s.trade_id === trade.id && s.start_date <= this.today);
      const active = candidates.filter((s) => this.today <= s.end_date);
      const pool = active.length ? active : candidates;
      const item =
        (p.area ? pool.find((s) => s.area.toLowerCase().includes(p.area!.toLowerCase())) : null) ??
        pool.sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
      if (!item) continue;
      any = true;

      await upsertProgress(item.id, this.today, p.qty, p.note ?? null);
      const entries = (await store().list("progress_entry", { where: { schedule_item_id: item.id } }))
        .filter((e) => e.date <= this.today)
        .sort((a, b) => a.date.localeCompare(b.date));
      const unit = item.unit ?? p.unit ?? "";
      const label = `${trade.name} ${item.area}`;
      const pa = planVsActual(
        item,
        entries.map((e) => e.actual_qty),
        werktageBetween(this.today, item.end_date, this.region),
      );
      const pct = pa ? Math.round(pa.daily_rate * 100) : null;
      const summary = pa
        ? `${label}: heute ${fmtNumber(p.qty)} ${unit} von ${fmtNumber(item.planned_per_day ?? 0)} ${unit} geplant (${pct} %)`
        : `${label}: heute ${fmtNumber(p.qty)} ${unit}`;

      await addDiaryEntry(this.team.id, this.today, {
        kind: "progress",
        schedule_item_id: item.id,
        label,
        qty: p.qty,
        unit,
        planned: item.planned_per_day,
        at: this.now.toISOString(),
      });
      await addEvent(
        { project_id: this.ctx.project.id, case_id: null, kind: "progress_recorded", payload: { summary_de: summary, schedule_item_id: item.id, team_id: this.team.id } },
        this.now,
      );
      this.parts.push({
        kind: "line",
        key: "progressNoted",
        vars: { item: label, qty: `${fmtNumber(p.qty)}\u00a0${unit}`.trim(), pct: pct ?? "–" },
      });

      if (!pa?.deviation) continue;
      const delay = Number.isFinite(pa.forecast_delay_days) ? Math.ceil(pa.forecast_delay_days) : null;
      const reason = `${summary}. Prognose: ${delay ? `ca. ${delay} Arbeitstage` : "nicht absehbar"} Verzug.`;
      await addEvent(
        { project_id: this.ctx.project.id, case_id: null, kind: "deviation", payload: { reason_de: reason, schedule_item_id: item.id, team_id: this.team.id } },
        this.now,
      );
      for (const dep of dependents(item.id, this.ctx.schedule)) {
        const depTrade = this.ctx.trades.find((t) => t.id === dep.trade_id) ?? null;
        const contact = this.ctx.contacts.find((c) => c.id === depTrade?.contact_id) ?? null;
        const facts: Record<string, unknown> = {
          report_date: this.today,
          predecessor: `${label} (${item.activity})`,
          successor: `${depTrade?.name ?? "Folgegewerk"} ${dep.area}`,
          forecast_delay_days: delay ?? 0,
          planned_start: dep.start_date,
          new_start: delay ? addWerktage(dep.start_date, delay, this.region) : dep.start_date,
          basis: `Ist-Leistung heute ${fmtNumber(p.qty)} ${unit} statt ${fmtNumber(item.planned_per_day ?? 0)} ${unit} (${pct} %); erbracht ${fmtNumber(pa.done_qty)} von ${fmtNumber(item.planned_qty ?? 0)} ${unit}, Restmenge ${fmtNumber(pa.remaining_qty)} ${unit}, durchschnittlich ${fmtNumber(pa.avg_actual_per_day, 1)} ${unit} je Arbeitstag.`,
          _trade: depTrade?.name ?? null,
          _contact_id: contact?.id ?? null,
          _confirmed_at: this.now.toISOString(),
        };
        const created = await this.createCase("info_folgegewerk", facts, { status: "bereit", flags: ["suggested"], sphere: null });
        await this.makeDocument(created);
        await addEvent(
          {
            project_id: this.ctx.project.id,
            case_id: created.id,
            kind: "followup_proposed",
            payload: { reference: created.reference, doc_type: created.doc_type, summary_de: `Information an ${contact?.organisation ?? depTrade?.name ?? "Folgegewerk"} vorbereitet` },
          },
          this.now,
        );
        this.parts.push({
          kind: "line",
          key: "deviationNote",
          vars: { days: delay ?? "?", successor: contact?.organisation ?? depTrade?.name ?? "" },
        });
      }
    }
    return any;
  }

  // ── Events → cases ──────────────────────────────────────────────────

  private async openEvent(ev: ExtractedEvent): Promise<void> {
    const conf = { _confidence: ev.confidence };
    if (ev.doc_type === "diary_only") {
      const text = (typeof ev.facts.note === "string" && ev.facts.note) || this.userTextDe || this.userText;
      await addDiaryEntry(this.team.id, this.today, { kind: "note", text, at: this.now.toISOString(), by: this.user?.name ?? null });
      await addEvent({ project_id: this.ctx.project.id, case_id: null, kind: "diary_entry", payload: { text, team_id: this.team.id } }, this.now);
      this.parts.push({ kind: "line", key: "diaryNoted" });
      return;
    }
    if (ev.doc_type in NOT_BUILT_DE) {
      await addEvent(
        {
          project_id: this.ctx.project.id,
          case_id: null,
          kind: "unsupported_event",
          payload: { doc_type: ev.doc_type, text_de: this.userTextDe ?? this.userText, facts: ev.facts, team_id: this.team.id },
        },
        this.now,
      );
      this.parts.push({ kind: "line", key: "notBuilt" });
      return;
    }
    if (ev.doc_type === "behinderungsanzeige") return this.openHindrance(ev);
    if (ev.doc_type === "behinderung_ende") {
      const parent = await this.openHindranceFor(ev.trade_name_guess);
      await this.upsertCase("behinderung_ende", { ...ev.facts, ...conf }, { parent: parent?.id ?? null });
      return;
    }
    await this.upsertCase(ev.doc_type, { ...ev.facts, ...conf }, {});
  }

  private async openHindrance(ev: ExtractedEvent): Promise<void> {
    const key = tradeKey(ev.trade_name_guess);
    const known = this.state.hired_by?.[key];
    const sp = computeSphere(
      {
        causeKind: ev.cause_kind,
        tradeGuess: ev.trade_name_guess,
        hiredBy: known === "client" || known === "us" ? known : null,
        reportingTeamId: this.team.id,
      },
      this.ctx,
    );
    // Re-reported hindrance whose sphere was already settled in this conversation.
    const existing = this.pending.find((c) => c.doc_type === "behinderungsanzeige" || c.doc_type === "verzug_nu");
    const sphere = sp.sphere === "unclear" && existing?.sphere && existing.sphere !== "unclear" ? existing.sphere : sp.sphere;
    const facts: Record<string, unknown> = { ...ev.facts, _confidence: ev.confidence };
    if (sp.tradeName) facts._trade = sp.tradeName;

    if (sphere === "unclear" && known !== "unknown") {
      const c = await this.upsertCase("behinderungsanzeige", facts, { sphere: "unclear" });
      if (c) this.state.asked_sphere = { case_id: c.id, trade: ev.trade_name_guess };
      return;
    }
    if (sphere === "own_team") {
      await this.noteOwnTeam(facts, sp.tradeName);
      return;
    }
    const docType = sphere === "own_sub" ? "verzug_nu" : "behinderungsanzeige";
    const c = await this.upsertCase(docType, facts, { sphere });
    if (c) await this.routeHindranceCase(c, sphere, sp.trade, sp.tradeName);
  }

  /** Apply the sphere routing to a hindrance case (SPEC §5.2). */
  private async routeHindranceCase(c: Case, sphere: Sphere, trade: Trade | null, tradeName: string | null) {
    const route = routeHindrance(sphere, tradeName);
    const facts = { ...c.facts, ...(tradeName ? { _trade: tradeName } : {}) };
    switch (route.kind) {
      case "ask_sphere":
        return;
      case "diary":
        // Own crew: internal note only; the draft stays unused.
        this.dropPending(c.id);
        await this.noteOwnTeam(facts, tradeName);
        return;
      case "letter":
        if (route.doc_type === "verzug_nu") {
          const contact = this.ctx.contacts.find((x) => x.id === trade?.contact_id) ?? null;
          const isNew = c.doc_type !== "verzug_nu" || !c.flags.includes("internal_risk");
          await this.save(c, {
            doc_type: "verzug_nu",
            sphere: "own_sub",
            flags: unique([...c.flags, "internal_risk"]),
            facts: { ...facts, _contact_id: contact?.id ?? null, remedy_until: c.facts.remedy_until ?? addWerktage(this.today, 2, this.region) },
          });
          if (isNew) {
            const org = contact?.organisation ?? tradeName ?? "Nachunternehmer";
            this.parts.push({ kind: "line", key: "subcontractorNote", vars: { org } });
            await addEvent(
              {
                project_id: this.ctx.project.id,
                case_id: c.id,
                kind: "risk_flag",
                payload: {
                  reference: c.reference,
                  reason_de: `Hinweis: vermutlich eigene Sphäre (eigener Nachunternehmer ${org}) – keine Behinderungsanzeige, Abhilfe beim Nachunternehmer fordern, bitte prüfen`,
                },
              },
              this.now,
            );
          }
          return;
        }
        await this.save(c, {
          doc_type: "behinderungsanzeige",
          sphere,
          flags: route.cost_reservation ? c.flags.filter((f) => f !== "no_cost_reservation") : unique([...c.flags, "no_cost_reservation"]),
          facts: { ...facts, _cost_reservation: route.cost_reservation },
        });
        return;
    }
  }

  private async noteOwnTeam(facts: Record<string, unknown>, tradeName: string | null) {
    const what = [facts.cause, facts.area].filter((x) => typeof x === "string" && x).join(", ") || this.userTextDe || this.userText;
    const reason = `Hinweis: vermutlich eigene Sphäre (eigene Kolonne${tradeName ? `, ${tradeName}` : ""}) – interner Vermerk, bitte prüfen`;
    await addDiaryEntry(this.team.id, this.today, { kind: "incident", text: what, internal_risk: true, at: this.now.toISOString() });
    await addEvent(
      { project_id: this.ctx.project.id, case_id: null, kind: "risk_flag", payload: { reason_de: `${reason}: ${what}`, team_id: this.team.id } },
      this.now,
    );
    this.parts.push({ kind: "line", key: "ownTeamNoted" });
  }

  /** Latest open hindrance of this team (parent of a "Wegfall der Behinderung"). */
  private async openHindranceFor(tradeGuess: string | null): Promise<Case | null> {
    const all = await listCases(this.ctx.project.id);
    const open = all.filter(
      (c) => c.doc_type === "behinderungsanzeige" && c.team_id === this.team.id && !["entwurf", "abgeschlossen"].includes(c.status),
    );
    const name = canonicalTradeName(tradeGuess);
    return (name ? open.find((c) => c.facts._trade === name) : null) ?? open[0] ?? null;
  }

  private dropPending(id: string) {
    this.pending = this.pending.filter((c) => c.id !== id);
    this.state.pending_case_ids = this.pending.map((c) => c.id);
    if (this.state.asked?.case_id === id) this.state.asked = null;
    if (this.state.asked_sphere?.case_id === id) this.state.asked_sphere = null;
  }

  // ── Case persistence ────────────────────────────────────────────────

  /** Merge into the open draft of the same type in this conversation, or open a new one. */
  private async upsertCase(
    docType: string,
    facts: Record<string, unknown>,
    opts: { sphere?: Case["sphere"]; parent?: string | null },
  ): Promise<Case | null> {
    if (!getDocType(docType)) return null;
    const existing = this.pending.find((c) => c.doc_type === docType);
    if (existing) {
      const conf = Math.max(Number(existing.facts._confidence ?? 0), Number(facts._confidence ?? 0));
      return this.save(existing, {
        facts: { ...existing.facts, ...facts, _confidence: conf },
        sphere: opts.sphere ?? existing.sphere,
        parent_case_id: existing.parent_case_id ?? opts.parent ?? null,
      });
    }
    const c = await this.createCase(docType, facts, { status: "entwurf", sphere: opts.sphere ?? null, parent: opts.parent ?? null, flags: [] });
    this.pending.push(c);
    this.state.pending_case_ids = this.pending.map((x) => x.id);
    return c;
  }

  private async createCase(
    docType: string,
    facts: Record<string, unknown>,
    opts: { status: Case["status"]; sphere: Case["sphere"]; parent?: string | null; flags: string[] },
  ): Promise<Case> {
    const base: NewCase = {
      project_id: this.ctx.project.id,
      team_id: this.team.id,
      conversation_id: this.conv.id,
      doc_type: docType,
      status: opts.status,
      sphere: opts.sphere,
      facts: this.withInferred(docType, facts),
      missing_fields: [],
      checks: [],
      deadline_at: null,
      deadline_rule: null,
      parent_case_id: opts.parent ?? null,
      created_by: this.conv.user_id,
      asked_fields: [],
      declined_fields: [],
      flags: opts.flags,
      created_at: this.now.toISOString(),
    };
    const evaluated = this.evaluate({ ...base, created_at: this.now.toISOString() });
    const c = await createCase({ ...base, ...evaluated }, this.now);
    this.cases.set(c.id, c);
    this.touched.add(c.id);
    await addEvent(
      {
        project_id: this.ctx.project.id,
        case_id: c.id,
        kind: "case_created",
        payload: { reference: c.reference, doc_type: c.doc_type, status: c.status, team_id: this.team.id },
      },
      this.now,
    );
    return c;
  }

  private async save(c: Case, patch: Partial<Case>): Promise<Case> {
    const current = this.cases.get(c.id) ?? c;
    const merged: Case = { ...current, ...patch };
    // Fact patches add to what is stored (callers may hold an older copy of the case).
    merged.facts = this.withInferred(merged.doc_type, patch.facts ? { ...current.facts, ...patch.facts } : current.facts);
    const evaluated = this.evaluate(merged);
    const saved = await updateCase(c.id, { ...patch, facts: merged.facts, ...evaluated }, this.now);
    this.cases.set(saved.id, saved);
    this.pending = this.pending.map((p) => (p.id === saved.id ? saved : p));
    this.touched.add(saved.id);
    return saved;
  }

  private evaluate(c: Pick<Case, "doc_type" | "facts" | "sphere" | "flags" | "created_at">) {
    const def = requireDocType(c.doc_type);
    const ev = evaluateCase(
      {
        def,
        facts: c.facts,
        sphere: c.sphere,
        confidence: typeof c.facts._confidence === "number" ? c.facts._confidence : null,
        now: new Date(c.created_at),
        subcontractorContactId: typeof c.facts._contact_id === "string" ? c.facts._contact_id : null,
      },
      this.ctx,
    );
    const kept = c.flags.filter((f) => !EVALUATED_FLAGS.has(f) || (f === "internal_risk" && c.doc_type === "verzug_nu"));
    return {
      missing_fields: ev.missing_fields,
      checks: ev.checks,
      deadline_at: ev.deadline.due_at,
      deadline_rule: ev.deadline_rule,
      flags: unique([...kept, ...ev.flags]),
    };
  }

  /** "Betroffene Leistungen" can be inferred from the schedule (SPEC §5.2): own trade's item in that area today. */
  private withInferred(docType: string, facts: Record<string, unknown>): Record<string, unknown> {
    const def = getDocType(docType);
    if (!def?.fields.some((f) => f.key === "affected_works") || hasValue(facts.affected_works) || !this.teamTrade) return facts;
    const area = typeof facts.area === "string" ? facts.area.toLowerCase() : null;
    const items = this.todaysItems().filter((s) => s.trade_id === this.teamTrade!.id);
    const item = area ? items.find((s) => s.area.toLowerCase().includes(area) || area.includes(s.area.toLowerCase())) : null;
    if (!item) return facts;
    const inferred = Array.isArray(facts._inferred) ? (facts._inferred as string[]) : [];
    return { ...facts, affected_works: `${this.teamTrade.name}arbeiten ${item.area}`, _inferred: unique([...inferred, "affected_works"]) };
  }

  // ── Rendering ───────────────────────────────────────────────────────

  private async render(lang: string): Promise<string> {
    const out = await Promise.all(
      this.parts.map(async (p) => {
        switch (p.kind) {
          case "line":
            return line(p.key, lang, lang === "de" && p.varsDe ? p.varsDe : p.vars);
          case "question":
            return question(p.docType, p.field, lang);
          case "readback": {
            const cs = p.caseIds.map((id) => this.cases.get(id)).filter((c): c is Case => !!c);
            return (await readback(cs, lang, this.now)).text;
          }
        }
      }),
    );
    return out.filter(Boolean).join(" ");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** SPEC §5.2: a verbal instruction for extra work also needs a written confirmation of the instruction. */
export function withVerbalConfirmation(events: ExtractedEvent[]): ExtractedEvent[] {
  const out = events.map((e) => ({ ...e, facts: { ...e.facts } }));
  const mk = out.find((e) => e.doc_type === "mehrkostenanzeige");
  let ab = out.find((e) => e.doc_type === "anordnung_bestaetigung");
  if (mk && mk.facts.verbal === true && !ab) {
    ab = {
      doc_type: "anordnung_bestaetigung",
      trade_name_guess: mk.trade_name_guess,
      cause_kind: mk.cause_kind,
      confidence: mk.confidence,
      facts: {
        ...(mk.facts.instruction_date ? { instruction_date: mk.facts.instruction_date } : {}),
        ...(mk.facts.instructed_by ? { instructed_by: mk.facts.instructed_by } : {}),
        ...(mk.facts.instruction_text || mk.facts.description ? { instruction_text: mk.facts.instruction_text ?? mk.facts.description } : {}),
      },
    };
    out.push(ab);
  }
  // Shared facts of the pair stay in sync.
  if (mk && ab) {
    for (const k of ["instruction_date", "instructed_by"]) {
      if (!hasValue(mk.facts[k]) && hasValue(ab.facts[k])) mk.facts[k] = ab.facts[k];
      if (!hasValue(ab.facts[k]) && hasValue(mk.facts[k])) ab.facts[k] = mk.facts[k];
    }
  }
  // The mehrkosten registry has no instruction_text; keep facts clean.
  if (mk) delete mk.facts.instruction_text;
  return out;
}

function mergeTentative(prev: ConversationState["tentative"], events: ExtractedEvent[]): NonNullable<ConversationState["tentative"]> {
  const first = events[0];
  const base = prev && prev.doc_type === first.doc_type ? prev : { doc_type: first.doc_type, trade_name_guess: null, cause_kind: "unknown", facts: {} };
  return {
    doc_type: base.doc_type,
    trade_name_guess: first.trade_name_guess ?? base.trade_name_guess,
    cause_kind: first.cause_kind !== "unknown" ? first.cause_kind : base.cause_kind,
    facts: { ...base.facts, ...first.facts },
  };
}
