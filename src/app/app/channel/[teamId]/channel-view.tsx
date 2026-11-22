"use client";
// Team channel (SPEC §8): chat with Klara, document cards, morning and evening
// cards, and the big round mic button that calls Klara. Text is the fallback
// for voice and works without any AI key (keyword reader). Klara's cards speak
// the user's language; what the user taps is sent as their own words.
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Camera, Mic, Phone } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { BTN_OUTLINE, BTN_PRIMARY } from "@/components/mobile/buttons";
import { CaseCard } from "@/components/mobile/case-card";
import { MobileHeader } from "@/components/mobile/mobile-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cardLines, LINES, WORDS, type CardLines } from "@/lib/agent/lines";
import type { TurnResponse } from "@/lib/agent/types";
import { berlinDayOf, fmtDate, fmtNumber, fmtTime } from "@/lib/labels";
import type { CaseView, ChannelFeed, ConfirmView, Conversation, Turn } from "@/lib/types";
import { ApiError, postJson, useApi } from "@/lib/use-api";
import { uploadPhoto } from "@/lib/photo-client";
import { cn } from "@/lib/utils";
import { $t } from "@/lib/i18n";

type Item =
  | { kind: "turn"; at: string; turn: Turn }
  | { kind: "case"; at: string; c: CaseView }
  | { kind: "call"; at: string; call: ChannelFeed["calls"][number] }
  | { kind: "photo"; at: string; photo: ChannelFeed["photos"][number] };

type Pending = { text: string; error: string | null };
/** A photo on its way to Klara (shown from the phone's own copy until the feed has it). */
type PhotoPending = { file: File; preview: string; error: string | null };
type Extra = { turns: Turn[]; cases: CaseView[]; confirm: ConfirmView | null; klaraTurnId: string | null };
type Composer = { placeholder: string | null; numeric: boolean };

const NO_EXTRA: Extra = { turns: [], cases: [], confirm: null, klaraTurnId: null };
const NO_COMPOSER: Composer = { placeholder: null, numeric: false };
/** Longer German subtitles fold away; the user reads their own language first. */
const SUBTITLE_FOLD_WORDS = 20;

export function ChannelView({ teamId }: { teamId: string }) {
  const { data: feed, error, reload } = useApi<ChannelFeed>(`/api/channel/${teamId}`);
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState("");
  const [composer, setComposer] = useState<Composer>(NO_COMPOSER);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const scrolledOnce = useRef(false);
  const reduceMotion = useReducedMotion();
  // Turns and cards from the last reply, shown right away; the reloaded feed replaces them (same ids).
  const [extra, setExtra] = useState<Extra>(NO_EXTRA);
  const [photo, setPhoto] = useState<PhotoPending | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => (feed ? buildItems(feed, extra) : []), [feed, extra]);
  const lang = feed?.language ?? "de";
  const lines = cardLines(lang);
  // The reply is newer than the feed until the reload brings its turn.
  const confirm = feed ? (extra.klaraTurnId && !feed.turns.some((t) => t.id === extra.klaraTurnId) ? extra.confirm : feed.confirm) : null;
  const lastKlara = [...items].reverse().find((it) => it.kind === "turn" && it.turn.role === "klara");
  const confirmTurnId = confirm && lastKlara?.kind === "turn" ? lastKlara.turn.id : null;

  const busy = !!pending && !pending.error;
  // Morning card until the Polier has written anything today.
  const spokeToday = !!feed && [...feed.turns, ...extra.turns].some((t) => t.role === "user" && berlinDayOf(t.created_at) === feed.today.day);
  const showMorning = !!feed && feed.today.hour < 12 && !feed.today.diary_done && !spokeToday && !pending && !confirm;
  const eveningItems = feed && feed.today.hour >= 15 && !confirm ? feed.today.items.filter((i) => i.actual_today === null) : [];

  // Keep the newest message in view; jump on first load, glide afterwards.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !feed) return;
    const instant = !scrolledOnce.current || reduceMotion;
    el.scrollTo({ top: el.scrollHeight, behavior: instant ? "auto" : "smooth" });
    scrolledOnce.current = true;
  }, [feed, items.length, pending, confirmTurnId, showMorning, eveningItems.length, reduceMotion]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setPending({ text: t, error: null });
    setDraft("");
    setComposer(NO_COMPOSER);
    try {
      const conv = feed?.conversation ?? (await postJson<Conversation>("/api/conversations", { team_id: teamId, kind: "chat" }));
      const r = await postJson<TurnResponse>("/api/agent/turn", { conversation_id: conv.id, text_original: t, language: null });
      setExtra((x) => ({
        turns: [...x.turns, r.user_turn, r.klara_turn],
        cases: [...x.cases.filter((c) => !r.cases.some((n) => n.id === c.id)), ...r.cases.filter((c) => c.status !== "entwurf")],
        confirm: r.confirm,
        klaraTurnId: r.klara_turn.id,
      }));
      setPending(null);
      reload();
    } catch (e) {
      setPending({ text: t, error: sendError(e) });
    }
  };

  /** "Foto": the phone's camera; the photo goes to the case being talked about (else today's case or report). */
  const sendPhoto = async (file: File, preview: string) => {
    setPhoto({ file, preview, error: null });
    try {
      const conv = feed?.conversation ?? (await postJson<Conversation>("/api/conversations", { team_id: teamId, kind: "chat" }));
      const r = await uploadPhoto({ file, teamId, conversationId: conv.id });
      const klara = r.klara_turn;
      if (klara) setExtra((x) => ({ ...x, turns: [...x.turns, klara] }));
      await reload();
      setPhoto(null);
      URL.revokeObjectURL(preview);
    } catch (e) {
      setPhoto({ file, preview, error: sendError(e) });
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  /** Put text in the composer and focus it, cursor at the end. */
  const compose = (text: string, next: Composer) => {
    setDraft(text);
    setComposer(next);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    });
  };

  const liveText = busy ? "Klara denkt …" : pending?.error ? `Nicht gesendet. ${pending.error}` : lastSpokenLine(extra);

  return (
    <div className="flex h-dvh min-h-0 flex-col">
      <MobileHeader
        title={feed?.team.name ?? $t("Teamkanal")}
        subtitle={feed?.project_name}
        backHref="/app"
        backLabel={$t("Zurück zu den Teamkanälen")}
        trailing={
          <Link
            href={`/app/call/new?team=${teamId}`}
            aria-label={$t("Klara anrufen")}
            className="flex size-12 shrink-0 items-center justify-center rounded-lg text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Phone className="size-5" aria-hidden />
          </Link>
        }
      />

      <main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-6" aria-busy={busy}>
        {error && !feed ? <LoadError message={error} onRetry={reload} /> : null}
        {!feed && !error ? <FeedSkeleton /> : null}

        {feed ? (
          <>
            {feed.llm_mode === "mock" ? (
              <p className="mb-3 text-center text-xs text-muted-foreground">{$t("Testmodus: Klara versteht ohne KI-Schlüssel nur einfache Sätze.")}</p>
            ) : null}

            {items.length === 0 && !pending ? <EmptyState compact={showMorning} /> : null}

            <ol className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {items.map((it, i) => {
                  const prev = items[i - 1];
                  const day = berlinDayOf(it.at);
                  const newDay = !prev || berlinDayOf(prev.at) !== day;
                  return (
                    <motion.li
                      key={itemKey(it)}
                      layout={false}
                      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    >
                      {newDay ? <DaySeparator day={day} today={feed.today.day} /> : null}
                      {it.kind === "turn" && it.turn.id === confirmTurnId && confirm ? (
                        <ConfirmCard
                          view={confirm}
                          turn={it.turn}
                          lines={lines}
                          busy={busy}
                          onYes={() => void send(lines.confirmYes)}
                          onChange={() => compose("", { placeholder: (LINES[lang] ?? LINES.en).denyAsk, numeric: false })}
                        />
                      ) : (
                        <FeedItem it={it} showTime={showTimeAfter(it, items[i + 1])} />
                      )}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
              {photo ? (
                <li>
                  <PhotoBubble src={photo.preview} label={$t("Ihr Foto")} uploading={!photo.error} />
                  {photo.error ? (
                    <div className="mt-1.5 flex flex-wrap items-center justify-end gap-x-3 text-sm">
                      <span className="text-foreground">Nicht gesendet. {photo.error}</span>
                      <button
                        type="button"
                        onClick={() => void sendPhoto(photo.file, photo.preview)}
                        className="h-12 rounded-lg px-3 font-medium text-primary outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {$t("Erneut senden")}
                      </button>
                    </div>
                  ) : null}
                </li>
              ) : null}
              {pending ? (
                <li>
                  {items.length === 0 || berlinDayOf(items[items.length - 1].at) !== feed.today.day ? (
                    <DaySeparator day={feed.today.day} today={feed.today.day} />
                  ) : null}
                  <UserBubble text={pending.text} />
                  {pending.error ? (
                    <div className="mt-1.5 flex flex-wrap items-center justify-end gap-x-3 text-sm">
                      <span className="text-foreground">Nicht gesendet. {pending.error}</span>
                      <button
                        type="button"
                        onClick={() => void send(pending.text)}
                        className="h-12 rounded-lg px-3 font-medium text-primary outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {$t("Erneut senden")}
                      </button>
                    </div>
                  ) : null}
                </li>
              ) : null}
              {busy ? (
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <KlaraAvatar size={28} mood="thinking" />
                  {$t("Klara denkt …")}
                </li>
              ) : null}
            </ol>

            {showMorning ? (
              <KlaraCard className="mt-3" text={lines.morningAsk} subtitle={lang === "de" ? null : CARD_LINES_DE.morningAsk} lang={lang}>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <button type="button" disabled={busy} onClick={() => void send(lines.morningOk)} className={BTN_PRIMARY} lang={lang}>
                    {lines.morningOk}
                  </button>
                  <button
                    type="button"
                    onClick={() => compose("", { placeholder: lines.deviationHint, numeric: false })}
                    className={BTN_OUTLINE}
                    lang={lang}
                  >
                    {lines.morningDeviation}
                  </button>
                </div>
              </KlaraCard>
            ) : null}

            {eveningItems.length ? (
              <KlaraCard className="mt-3" text={lines.eveningAsk} subtitle={lang === "de" ? null : CARD_LINES_DE.eveningAsk} lang={lang}>
                <ul className="mt-3 flex flex-col divide-y divide-border">
                  {eveningItems.map((i) => {
                    const today = (WORDS[lang] ?? WORDS.en).today;
                    const planned = i.planned_per_day;
                    return (
                      <li key={i.id} className="py-3 first:pt-0 last:pb-0">
                        <p className="flex items-baseline justify-between gap-3 text-[15px] text-foreground">
                          <span className="min-w-0">{i.label}</span>
                          {planned ? (
                            <span className="shrink-0 text-sm text-muted-foreground">
                              Plan <span className="font-mono">{fmtNumber(planned)}</span> {i.unit}
                            </span>
                          ) : null}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-3">
                          {planned ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void send(`${i.label} ${today}: ${fmtNumber(planned)}`)}
                              className={BTN_PRIMARY}
                              lang={lang}
                            >
                              {lines.eveningAsPlanned}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => compose(`${i.label} ${today}: `, { placeholder: null, numeric: true })}
                            className={cn(BTN_OUTLINE, !planned && "col-span-2")}
                            lang={lang}
                          >
                            {lines.eveningOther}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </KlaraCard>
            ) : null}
          </>
        ) : null}
      </main>

      <p className="sr-only" aria-live="polite">
        {liveText}
      </p>

      <form
        onSubmit={onSubmit}
        className="flex shrink-0 items-center gap-2 border-t border-border bg-background px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
      >
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void sendPhoto(file, URL.createObjectURL(file));
          }}
        />
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={!!photo && !photo.error}
          aria-label={$t("Foto aufnehmen")}
          className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Camera className="size-5" aria-hidden />
        </button>
        <label htmlFor="klara-input" className="sr-only">
          {$t("Nachricht an Klara")}
        </label>
        <input
          ref={inputRef}
          id="klara-input"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (!e.target.value) setComposer(NO_COMPOSER);
          }}
          placeholder={composer.placeholder ?? $t("Nachricht an Klara")}
          autoComplete="off"
          enterKeyHint="send"
          inputMode={composer.numeric ? "decimal" : "text"}
          className="h-12 min-w-0 flex-1 rounded-full border border-border bg-surface px-4 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        {draft.trim() ? (
          <button
            type="submit"
            disabled={busy}
            aria-label={$t("Senden")}
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          >
            <ArrowUp className="size-7" aria-hidden />
          </button>
        ) : (
          <Link
            href={`/app/call/new?team=${teamId}`}
            aria-label={$t("Klara anrufen")}
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Mic className="size-7" aria-hidden />
          </Link>
        )}
      </form>
    </div>
  );
}

const CARD_LINES_DE = cardLines("de");


/** What went wrong, in words the Polier can act on. */
function sendError(e: unknown): string {
  if (e instanceof ApiError && e.status < 500) return e.message;
  if (e instanceof ApiError) return $t("Klara ist gerade nicht erreichbar. Ihre Nachricht bleibt hier.");
  return $t("Keine Verbindung. Ihre Nachricht bleibt hier.");
}

/** Klara's newest line from this visit, for the screen reader (history is not re-announced). */
function lastSpokenLine(extra: Extra): string {
  const t = [...extra.turns].reverse().find((x) => x.role === "klara");
  return t ? `Klara: ${t.text_original}` : "";
}

// ── Feed ───────────────────────────────────────────────────────────────

function buildItems(feed: ChannelFeed, extra: Extra): Item[] {
  const turnIds = new Set(feed.turns.map((t) => t.id));
  const caseIds = new Set(feed.cases.map((c) => c.id));
  const turns = [...feed.turns, ...extra.turns.filter((t) => !turnIds.has(t.id) && t.conversation_id === feed.conversation?.id)];
  const cases = [...feed.cases, ...extra.cases.filter((c) => !caseIds.has(c.id))];
  const items: Item[] = [
    ...turns.map((turn) => ({ kind: "turn" as const, at: turn.created_at, turn })),
    ...cases.map((c) => ({ kind: "case" as const, at: typeof c.facts._confirmed_at === "string" ? c.facts._confirmed_at : c.created_at, c })),
    ...feed.calls.map((call) => ({ kind: "call" as const, at: call.ended_at ?? call.started_at, call })),
    ...feed.photos.map((photo) => ({ kind: "photo" as const, at: photo.at, photo })),
  ];
  // A photo comes before Klara's "Foto abgelegt", a case card after Klara's confirmation in the same instant.
  const rank = { photo: -1, turn: 0, call: 1, case: 2 };
  return items.sort((a, b) => a.at.localeCompare(b.at) || rank[a.kind] - rank[b.kind]);
}

function itemKey(it: Item): string {
  return it.kind === "turn" ? `t-${it.turn.id}` : it.kind === "case" ? `c-${it.c.id}` : it.kind === "photo" ? `p-${it.photo.id}` : `k-${it.call.id}`;
}

/** One timestamp per run of messages from the same speaker in the same minute. */
function showTimeAfter(it: Item, next: Item | undefined): boolean {
  if (it.kind !== "turn") return false;
  if (!next || next.kind !== "turn") return true;
  return next.turn.role !== it.turn.role || fmtTime(next.at) !== fmtTime(it.at);
}

function DaySeparator({ day, today }: { day: string; today: string }) {
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const word = day === today ? $t("Heute") : day === yesterday ? $t("Gestern") : null;
  return (
    <p className="mt-2 mb-3 text-center text-xs text-muted-foreground">
      <time dateTime={day}>
        {word ? `${word}, ` : null}
        <span className="font-mono">{fmtDate(day)}</span>
      </time>
    </p>
  );
}

function FeedItem({ it, showTime }: { it: Item; showTime: boolean }) {
  if (it.kind === "case") return <CaseCard c={it.c} className="ml-9" />;
  if (it.kind === "photo") return <PhotoBubble src={it.photo.url} href={it.photo.url} label={`Foto zu ${it.photo.reference}`} at={it.photo.at} />;
  if (it.kind === "call") {
    return (
      <Link
        href={`/app/call/${it.call.id}`}
        className="ml-9 flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Phone className="size-4 text-muted-foreground" aria-hidden />
        <span>
          {$t("Anruf mit Klara,")}{" "}
          <time dateTime={it.call.started_at} className="font-mono">
            {fmtTime(it.call.started_at)}
          </time>
        </span>
      </Link>
    );
  }
  const t = it.turn;
  const subtitle = t.language && t.language !== "de" && t.text_de && t.text_de !== t.text_original ? t.text_de : null;
  const at = showTime ? t.created_at : undefined;
  return t.role === "user" ? (
    <UserBubble text={t.text_original} subtitle={subtitle} at={at} lang={t.language} />
  ) : (
    <KlaraBubble text={t.text_original} subtitle={subtitle} at={at} lang={t.language} />
  );
}

function UserBubble({ text, subtitle, at, lang }: { text: string; subtitle?: string | null; at?: string; lang?: string | null }) {
  return (
    <div className="flex flex-col items-end">
      <div lang={lang ?? undefined} className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2.5 text-[15px] leading-snug text-foreground">
        <span className="sr-only">Sie: </span>
        {text}
      </div>
      {subtitle ? <Subtitle text={subtitle} align="right" /> : null}
      {at ? (
        <time dateTime={at} className="mt-1 font-mono text-[11px] text-muted-foreground">
          {fmtTime(at)}
        </time>
      ) : null}
    </div>
  );
}

/** A photo the Polier sent: on the user's side, tap opens it full size. */
function PhotoBubble({ src, href, label, at, uploading = false }: { src: string; href?: string; label: string; at?: string; uploading?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element -- a private API image, not a static asset for next/image
  const img = <img src={src} alt={label} loading="lazy" className={cn("block max-h-64 max-w-full rounded-2xl rounded-br-md border border-border object-cover", uploading && "opacity-60")} />;
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[70%]">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {img}
          </a>
        ) : (
          img
        )}
      </div>
      {uploading ? (
        <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
          {$t("Foto wird gesendet …")}
        </p>
      ) : at ? (
        <time dateTime={at} className="mt-1 font-mono text-[11px] text-muted-foreground">
          {fmtTime(at)}
        </time>
      ) : null}
    </div>
  );
}

function KlaraBubble({ text, subtitle, at, lang }: { text: string; subtitle: string | null; at?: string; lang?: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <KlaraAvatar size={28} className="mt-0.5" />
      <div className="min-w-0 max-w-[85%]">
        <div lang={lang ?? undefined} className="rounded-2xl rounded-tl-md border border-border bg-background px-3.5 py-2.5 text-[15px] leading-snug text-foreground">
          <span className="sr-only">{$t("Klara:")} </span>
          {text}
        </div>
        {subtitle ? <Subtitle text={subtitle} /> : null}
        {at ? (
          <time dateTime={at} className="mt-1 block font-mono text-[11px] text-muted-foreground">
            {fmtTime(at)}
          </time>
        ) : null}
      </div>
    </div>
  );
}

/** German version under a non-German line; long ones fold behind a toggle. */
function Subtitle({ text, align = "left" }: { text: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const long = text.split(/\s+/).length > SUBTITLE_FOLD_WORDS;
  const right = align === "right";
  if (!long) {
    return (
      <p lang="de" className={cn("mt-1 text-sm leading-snug text-muted-foreground", right && "max-w-[85%] text-right")}>
        {text}
      </p>
    );
  }
  return (
    <div className={cn("flex flex-col", right ? "max-w-[85%] items-end" : "items-start")}>
      {open ? (
        <p lang="de" className={cn("mt-1 text-sm leading-snug text-muted-foreground", right && "text-right")}>
          {text}
        </p>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="-mx-2 h-12 rounded-lg px-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? $t("Deutsch ausblenden") : $t("Deutsch anzeigen")}
      </button>
    </div>
  );
}

function KlaraCard({
  text,
  subtitle,
  lang,
  children,
  className,
}: {
  text: string;
  subtitle: string | null;
  lang: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <KlaraAvatar size={28} className="mt-0.5" />
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-border bg-background p-3.5">
        <p lang={lang} className="text-[15px] leading-snug text-foreground">
          <span className="sr-only">{$t("Klara:")} </span>
          {text}
        </p>
        {subtitle ? (
          <p lang="de" className="mt-1 text-sm leading-snug text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** Klara's readback as a fact sheet with one-tap answers (SPEC §6.2 step 5). */
function ConfirmCard({
  view,
  turn,
  lines,
  busy,
  onYes,
  onChange,
}: {
  view: ConfirmView;
  turn: Turn;
  lines: CardLines;
  busy: boolean;
  onYes: () => void;
  onChange: () => void;
}) {
  const t = LINES[view.language] ?? LINES.en;
  const de = view.language === "de";
  return (
    <div className="flex items-start gap-2">
      <KlaraAvatar size={28} className="mt-0.5" />
      <section aria-label={$t("Zusammenfassung prüfen")} className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-border bg-background p-3.5">
        <p lang={view.language} className="text-[15px] leading-snug text-foreground">
          <span className="sr-only">{$t("Klara:")} </span>
          {view.intro === "correct" ? turn.text_original : t.readbackIntro}
        </p>
        {view.intro === "correct" && !de && turn.text_de && turn.text_de !== turn.text_original ? <Subtitle text={turn.text_de} /> : null}
        {view.docs.map((d) => (
          <div key={d.case_id} className="mt-3 border-t border-border pt-3">
            <h3 className="text-[15px] leading-snug font-semibold text-foreground">{d.title_de}</h3>
            {d.title ? (
              <p lang={view.language} className="text-sm text-muted-foreground">
                {d.title}
              </p>
            ) : null}
            <dl className="mt-2 grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-2">
              {d.rows.map((r) => (
                <div key={r.key} className="contents">
                  <dt lang={view.language} className="text-sm leading-snug text-muted-foreground">
                    {r.label}
                  </dt>
                  <dd className="min-w-0 text-[15px] leading-snug text-foreground">
                    <span lang={view.language}>{r.mono ? monoDigits(r.value) : r.value}</span>
                    {!de && r.value_de !== r.value ? (
                      <span lang="de" className="block text-sm text-muted-foreground">
                        {r.mono ? monoDigits(r.value_de) : r.value_de}
                      </span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        <p lang={view.language} className="mt-3 border-t border-border pt-3 text-[15px] leading-snug text-foreground">
          {t.readbackOutro}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button type="button" disabled={busy} onClick={onYes} className={BTN_PRIMARY} lang={view.language}>
            {lines.confirmYes}
          </button>
          <button type="button" disabled={busy} onClick={onChange} className={BTN_OUTLINE} lang={view.language}>
            {lines.confirmChange}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Numbers and times in Geist Mono, the words around them ("heute", "Personen") in the text face. */
function monoDigits(text: string): ReactNode {
  return text.split(/(\d[\d.,:]*)/).map((part, i) =>
    i % 2 ? (
      <span key={i} className="font-mono text-[0.93em]">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function EmptyState({ compact }: { compact: boolean }) {
  return (
    <div className={cn("flex flex-col items-center px-6 text-center", compact ? "py-6" : "py-12")}>
      <KlaraAvatar size={compact ? 56 : 72} />
      <p className="mt-4 text-base font-medium text-foreground">{$t("Was ist auf der Baustelle passiert?")}</p>
      <p className="mt-1 max-w-[32ch] text-sm text-muted-foreground">
        {$t("Tippen Sie auf das Mikrofon und sprechen Sie mit Klara, oder schreiben Sie in Ihrer Sprache.")}
      </p>
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <p className="text-base font-medium text-foreground">{$t("Der Teamkanal konnte nicht geladen werden.")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <button type="button" onClick={onRetry} className={cn(BTN_OUTLINE, "mt-4")}>
        {$t("Erneut laden")}
      </button>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-16 w-3/4" />
      <Skeleton className="ml-auto h-10 w-2/3" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
