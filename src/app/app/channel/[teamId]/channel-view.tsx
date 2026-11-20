"use client";
// Team channel (SPEC §8): chat with Klara, document cards, morning and evening
// cards, and the big round mic button that calls Klara. Text is the fallback
// for voice and works without any AI key (keyword reader).
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Mic, Phone } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { CaseCard } from "@/components/mobile/case-card";
import { MobileHeader } from "@/components/mobile/mobile-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { TurnResponse } from "@/lib/agent/types";
import { berlinDayOf, fmtDate, fmtNumber, fmtTime } from "@/lib/labels";
import type { CaseView, ChannelFeed, Conversation, Turn } from "@/lib/types";
import { postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

type Item =
  | { kind: "turn"; at: string; turn: Turn }
  | { kind: "case"; at: string; c: CaseView }
  | { kind: "call"; at: string; call: ChannelFeed["calls"][number] };

type Pending = { text: string; error: string | null };

export function ChannelView({ teamId }: { teamId: string }) {
  const { data: feed, error, reload } = useApi<ChannelFeed>(`/api/channel/${teamId}`);
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  // Turns and cards from the last reply, shown right away; the reloaded feed replaces them (same ids).
  const [extra, setExtra] = useState<{ turns: Turn[]; cases: CaseView[] }>({ turns: [], cases: [] });

  const items = useMemo(() => (feed ? buildItems(feed, extra) : []), [feed, extra]);

  // Keep the newest message in view.
  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: reduceMotion ? "auto" : "smooth" });
  }, [items.length, pending, reduceMotion]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || (pending && !pending.error)) return;
    setPending({ text: t, error: null });
    setDraft("");
    try {
      const conv = feed?.conversation ?? (await postJson<Conversation>("/api/conversations", { team_id: teamId, kind: "chat" }));
      const r = await postJson<TurnResponse>("/api/agent/turn", { conversation_id: conv.id, text_original: t, language: null });
      setExtra((x) => ({
        turns: [...x.turns, r.user_turn, r.klara_turn],
        cases: [...x.cases.filter((c) => !r.cases.some((n) => n.id === c.id)), ...r.cases.filter((c) => c.status !== "entwurf")],
      }));
      setPending(null);
      reload();
    } catch (e) {
      setPending({ text: t, error: e instanceof Error ? e.message : "Senden fehlgeschlagen" });
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  const prefill = (text: string) => {
    setDraft(text);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    });
  };

  const busy = !!pending && !pending.error;
  // Morning card until the Polier has written anything today.
  const spokeToday = !!feed && [...feed.turns, ...extra.turns].some((t) => t.role === "user" && berlinDayOf(t.created_at) === feed.today.day);
  const showMorning = !!feed && feed.today.hour < 12 && !feed.today.diary_done && !spokeToday && !pending;
  const eveningItems = feed && feed.today.hour >= 15 ? feed.today.items.filter((i) => i.actual_today === null) : [];

  return (
    <>
      <MobileHeader
        title={feed?.team.name ?? "Teamkanal"}
        subtitle={feed?.project_name}
        backHref="/app"
        backLabel="Zurück zu den Teamkanälen"
        trailing={
          <Link
            href={`/app/call/new?team=${teamId}`}
            aria-label="Klara anrufen"
            className="flex size-12 shrink-0 items-center justify-center rounded-lg text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Phone className="size-5" aria-hidden />
          </Link>
        }
      />

      <main className="flex flex-1 flex-col px-4 pt-4 pb-6" aria-live="polite" aria-busy={busy}>
        {error && !feed ? <p className="text-sm text-light-red-text">{error}</p> : null}
        {!feed && !error ? <FeedSkeleton /> : null}

        {feed ? (
          <>
            <p className="mb-4 text-center text-xs text-muted-foreground">
              Heute, <span className="font-mono">{fmtDate(feed.now)}</span>
              {feed.llm_mode === "mock" ? <span className="block">Testmodus: Klara versteht ohne KI-Schlüssel nur einfache Sätze.</span> : null}
            </p>

            {items.length === 0 && !showMorning && !pending ? <EmptyState /> : null}

            {showMorning ? (
              <KlaraCard>
                <p className="text-[15px] text-foreground">Guten Morgen. Läuft heute alles nach Plan?</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void send("Alles nach Plan")}
                    className="h-12 rounded-lg bg-primary px-4 text-[15px] font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    Alles nach Plan
                  </button>
                  <button
                    type="button"
                    onClick={() => prefill("")}
                    className="h-12 rounded-lg border border-border bg-background px-4 text-[15px] font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Abweichung melden
                  </button>
                </div>
              </KlaraCard>
            ) : null}

            <ol className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {items.map((it) => (
                  <motion.li
                    key={itemKey(it)}
                    layout={false}
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                  >
                    <FeedItem it={it} />
                  </motion.li>
                ))}
              </AnimatePresence>
              {pending ? (
                <li>
                  <UserBubble text={pending.text} />
                  {pending.error ? (
                    <div className="mt-1 flex items-center justify-end gap-3 text-sm">
                      <span className="text-light-red-text">Nicht gesendet: {pending.error}</span>
                      <button
                        type="button"
                        onClick={() => void send(pending.text)}
                        className="h-10 rounded-lg px-2 font-medium text-primary outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Erneut senden
                      </button>
                    </div>
                  ) : null}
                </li>
              ) : null}
              {busy ? (
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <KlaraAvatar size={28} mood="thinking" />
                  Klara denkt …
                </li>
              ) : null}
            </ol>

            {eveningItems.length ? (
              <KlaraCard className="mt-4">
                <p className="text-[15px] text-foreground">Feierabend. Wie viel haben Sie heute geschafft?</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {eveningItems.map((i) => (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() => prefill(`${i.label} heute: `)}
                        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 text-left text-[15px] text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span>{i.label}</span>
                        {i.planned_per_day ? (
                          <span className="text-sm text-muted-foreground">
                            Plan <span className="font-mono">{fmtNumber(i.planned_per_day)}</span> {i.unit}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </KlaraCard>
            ) : null}
            <div ref={endRef} />
          </>
        ) : null}
      </main>

      <form
        onSubmit={onSubmit}
        className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-border bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <label htmlFor="klara-input" className="sr-only">
          Nachricht an Klara
        </label>
        <input
          ref={inputRef}
          id="klara-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Nachricht an Klara"
          autoComplete="off"
          enterKeyHint="send"
          className="h-12 min-w-0 flex-1 rounded-full border border-border bg-surface px-4 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        {draft.trim() ? (
          <button
            type="submit"
            disabled={busy}
            aria-label="Senden"
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          >
            <ArrowUp className="size-6" aria-hidden />
          </button>
        ) : (
          <Link
            href={`/app/call/new?team=${teamId}`}
            aria-label="Klara anrufen"
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Mic className="size-6" aria-hidden />
          </Link>
        )}
      </form>
    </>
  );
}

// ── Feed ───────────────────────────────────────────────────────────────

function buildItems(feed: ChannelFeed, extra: { turns: Turn[]; cases: CaseView[] }): Item[] {
  const turnIds = new Set(feed.turns.map((t) => t.id));
  const caseIds = new Set(feed.cases.map((c) => c.id));
  const turns = [...feed.turns, ...extra.turns.filter((t) => !turnIds.has(t.id) && t.conversation_id === feed.conversation?.id)];
  const cases = [...feed.cases, ...extra.cases.filter((c) => !caseIds.has(c.id))];
  const items: Item[] = [
    ...turns.map((turn) => ({ kind: "turn" as const, at: turn.created_at, turn })),
    ...cases.map((c) => ({ kind: "case" as const, at: typeof c.facts._confirmed_at === "string" ? c.facts._confirmed_at : c.created_at, c })),
    ...feed.calls.map((call) => ({ kind: "call" as const, at: call.ended_at ?? call.started_at, call })),
  ];
  // A case card follows Klara's confirmation in the same instant.
  const rank = { turn: 0, call: 1, case: 2 };
  return items.sort((a, b) => a.at.localeCompare(b.at) || rank[a.kind] - rank[b.kind]);
}

function itemKey(it: Item): string {
  return it.kind === "turn" ? `t-${it.turn.id}` : it.kind === "case" ? `c-${it.c.id}` : `k-${it.call.id}`;
}

function FeedItem({ it }: { it: Item }) {
  if (it.kind === "case") return <CaseCard c={it.c} className="ml-9" />;
  if (it.kind === "call") {
    return (
      <Link
        href={`/app/call/${it.call.id}`}
        className="ml-9 flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Phone className="size-4 text-muted-foreground" aria-hidden />
        <span>
          Anruf mit Klara, <span className="font-mono">{fmtTime(it.call.started_at)}</span>
        </span>
      </Link>
    );
  }
  const t = it.turn;
  const subtitle = t.language && t.language !== "de" && t.text_de && t.text_de !== t.text_original ? t.text_de : null;
  return t.role === "user" ? <UserBubble text={t.text_original} subtitle={subtitle} at={t.created_at} lang={t.language} /> : <KlaraBubble turn={t} subtitle={subtitle} />;
}

function UserBubble({ text, subtitle, at, lang }: { text: string; subtitle?: string | null; at?: string; lang?: string | null }) {
  return (
    <div className="flex flex-col items-end">
      <div lang={lang ?? undefined} className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2.5 text-[15px] leading-snug text-foreground">
        {text}
      </div>
      {subtitle ? (
        <p lang="de" className="mt-1 max-w-[85%] text-right text-sm leading-snug text-muted-foreground">
          {subtitle}
        </p>
      ) : null}
      {at ? <time className="mt-1 font-mono text-[11px] text-muted-foreground">{fmtTime(at)}</time> : null}
    </div>
  );
}

function KlaraBubble({ turn, subtitle }: { turn: Turn; subtitle: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <KlaraAvatar size={28} className="mt-0.5" />
      <div className="min-w-0 max-w-[85%]">
        <div lang={turn.language ?? undefined} className="rounded-2xl rounded-tl-md border border-border bg-background px-3.5 py-2.5 text-[15px] leading-snug text-foreground">
          {turn.text_original}
        </div>
        {subtitle ? (
          <p lang="de" className="mt-1 text-sm leading-snug text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
        <time className="mt-1 block font-mono text-[11px] text-muted-foreground">{fmtTime(turn.created_at)}</time>
      </div>
    </div>
  );
}

function KlaraCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-start gap-2", className)}>
      <KlaraAvatar size={28} className="mt-0.5" />
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-border bg-background p-3.5">{children}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <KlaraAvatar size={72} />
      <p className="mt-4 text-base font-medium text-foreground">Was ist auf der Baustelle passiert?</p>
      <p className="mt-1 text-sm text-muted-foreground">Rufen Sie Klara über das Mikrofon an oder schreiben Sie in Ihrer Sprache.</p>
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
