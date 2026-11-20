"use client";
// Team channel (SPEC §8): chat with Klara + case cards. M1 = text only;
// voice (mic, call screen) arrives in M3.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Phone, SendHorizontal } from "lucide-react";
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { LightSummary } from "@/components/klara/traffic-light";
import { MobileHeader } from "@/components/mobile/mobile-header";
import { docTitle } from "@/lib/doctypes/titles";
import { CASE_STATUS_DE, fmtTime } from "@/lib/labels";
import type { ProjectContext } from "@/lib/db/repo";
import { useRole } from "@/lib/role";
import type { Case, Conversation, Turn } from "@/lib/types";
import { postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

type FeedItem = { kind: "turn"; turn: Turn } | { kind: "cases"; id: string; cases: Case[] };

type TurnResponse = {
  reply: string;
  user_turn: Turn;
  klara_turn: Turn;
  cases: Case[];
  ended: boolean;
  conversation: Conversation;
  llm_mode: "live" | "mock";
};

const storageKey = (teamId: string) => `klara_chat_${teamId}`;

export function ChannelView({ teamId }: { teamId: string }) {
  const { data: ctx } = useApi<ProjectContext>("/api/project", { live: false });
  const { userId } = useRole();
  const team = ctx?.teams.find((t) => t.id === teamId);
  const lead = ctx?.users.find((u) => u.id === team?.lead_user_id);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"live" | "mock" | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Restore the running chat for this team.
  useEffect(() => {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(storageKey(teamId));
    } catch {}
    if (!id) return;
    fetch(`/api/conversations/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { conversation: Conversation; turns: Turn[] } | null) => {
        if (!d || d.conversation.status === "closed") return;
        setConversationId(id);
        setFeed(d.turns.map((turn) => ({ kind: "turn", turn })));
      })
      .catch(() => {});
  }, [teamId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [feed, busy]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || busy) return;
    setBusy(true);
    setError(null);
    try {
      let convId = conversationId;
      if (!convId) {
        const conv = await postJson<Conversation>("/api/conversations", {
          team_id: teamId,
          user_id: lead?.id ?? userId,
          kind: "chat",
        });
        convId = conv.id;
        setConversationId(conv.id);
        try {
          sessionStorage.setItem(storageKey(teamId), conv.id);
        } catch {}
      }
      setText("");
      const optimistic: Turn = {
        id: `tmp-${Date.now()}`,
        conversation_id: convId,
        role: "user",
        text_original: msg,
        text_de: null,
        language: null,
        audio_url: null,
        created_at: new Date().toISOString(),
      };
      setFeed((f) => [...f, { kind: "turn", turn: optimistic }]);
      const res = await postJson<TurnResponse>("/api/agent/turn", { conversation_id: convId, text_original: msg });
      setMode(res.llm_mode);
      setFeed((f) => {
        const next: FeedItem[] = f.map((it) =>
          it.kind === "turn" && it.turn.id === optimistic.id ? { kind: "turn", turn: res.user_turn } : it,
        );
        next.push({ kind: "turn", turn: res.klara_turn });
        const shown = res.cases.filter((c) => c.status !== "entwurf");
        if (shown.length) next.push({ kind: "cases", id: res.klara_turn.id, cases: shown });
        return next;
      });
      if (res.ended) {
        setConversationId(null);
        try {
          sessionStorage.removeItem(storageKey(teamId));
        } catch {}
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nachricht konnte nicht gesendet werden");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <MobileHeader title={team?.name ?? "Team"} subtitle={ctx?.project.name} backHref="/app" />

      <main className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {feed.length === 0 && !busy && (
          <div className="flex flex-col items-center px-4 pt-10 text-center">
            <KlaraAvatar size={72} />
            <p className="mt-4 text-base font-medium text-foreground">Was ist auf der Baustelle passiert?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Schreiben Sie in Ihrer Sprache. Klara fragt nach, was fehlt, und bereitet das Schreiben vor.
            </p>
          </div>
        )}

        <ol className="space-y-3">
          <AnimatePresence initial={false}>
            {feed.map((item) =>
              item.kind === "turn" ? (
                <motion.li
                  key={item.turn.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                  className={cn("flex items-end gap-2", item.turn.role === "user" && "justify-end")}
                >
                  {item.turn.role === "klara" && <KlaraAvatar size={28} />}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug",
                      item.turn.role === "user"
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md border border-border bg-background text-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{item.turn.text_original}</p>
                    {item.turn.role === "user" && item.turn.text_de && item.turn.text_de !== item.turn.text_original && (
                      <p className="mt-1 border-t border-white/25 pt-1 text-[13px] text-primary-foreground/80">
                        DE: {item.turn.text_de}
                      </p>
                    )}
                    <p
                      className={cn(
                        "mt-1 text-right font-mono text-[11px]",
                        item.turn.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {fmtTime(item.turn.created_at)}
                    </p>
                  </div>
                </motion.li>
              ) : (
                <motion.li
                  key={`cases-${item.id}`}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                  className="space-y-2 pl-9"
                >
                  {item.cases.map((c) => (
                    <CaseCard key={c.id} c={c} />
                  ))}
                </motion.li>
              ),
            )}
          </AnimatePresence>
          {busy && (
            <li className="flex items-center gap-2 text-sm text-muted-foreground">
              <KlaraAvatar size={28} />
              Klara denkt…
            </li>
          )}
        </ol>
        <div ref={endRef} />
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {error && <p className="mb-2 px-1 text-sm text-light-red">{error}</p>}
        {mode === "mock" && (
          <p className="mb-2 px-1 text-xs text-muted-foreground">Testmodus: Klara läuft ohne KI-Modell (Stichwort-Erkennung).</p>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Link
            href={`/app/call/new?team=${teamId}`}
            aria-label="Klara anrufen"
            className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Phone className="size-5" aria-hidden />
          </Link>
          <label htmlFor="chat-input" className="sr-only">
            Nachricht an Klara
          </label>
          <textarea
            id="chat-input"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Nachricht an Klara…"
            className="min-h-12 flex-1 resize-none rounded-3xl border border-border bg-muted px-4 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            aria-label="Senden"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40"
          >
            <SendHorizontal className="size-5" aria-hidden />
          </button>
        </form>
      </footer>
    </>
  );
}

function CaseCard({ c }: { c: Case }) {
  return (
    <Link
      href={`/app/case/${c.id}`}
      className="block rounded-xl border border-border bg-background p-3.5 outline-none hover:border-zinc-300 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-foreground">{docTitle(c.doc_type)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="font-mono">{c.reference}</span>
            <span className="ml-2">{CASE_STATUS_DE[c.status]}</span>
          </p>
        </div>
        <ChevronRight className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <LightSummary checks={c.checks} className="mt-2.5" />
    </Link>
  );
}
