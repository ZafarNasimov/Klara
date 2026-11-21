"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { CalendarClock, ChevronDown, CircleDashed, FilePlus2, FilePen, Info, Link2, ListChecks, Quote } from "lucide-react";
import { fmtDate } from "@/lib/labels";
import {
  fmtClock,
  isUncertain,
  languageName,
  MEETING_TYPE_DE,
  segmentDe,
  sortLanguages,
  TEMPLATE_DE,
  TEMPLATE_KINDS,
  type MeetingChange,
  type MeetingItem,
  type MeetingView,
  type TemplateKind,
} from "@/lib/meetings/model";
import { cn } from "@/lib/utils";

export type DetailSection = "header" | "summary" | "decisions" | "tasks" | "detected" | "nothing" | "changes" | "transcript";
const ALL: DetailSection[] = ["header", "summary", "decisions", "tasks", "detected", "nothing", "changes", "transcript"];

/**
 * The finished meeting (status "ready"). Presentational: the app page and the
 * pitch card (cropped to summary / detected / changes) render the same thing.
 */
export function MeetingDetail({
  m,
  sections = ALL,
  actions,
  dense = false,
}: {
  m: MeetingView;
  sections?: DetailSection[];
  actions?: ReactNode;
  /** One line per detected item (pitch preview); the full page shows text and evidence. */
  dense?: boolean;
}) {
  const show = (s: DetailSection) => sections.includes(s);
  const [openTranscript, setOpenTranscript] = useState(false);
  const [view, setView] = useState<TranscriptView>("beide");
  const languages = m.languages?.length ? m.languages : sortLanguages(m.transcript.map((s) => s.language));
  const [flash, setFlash] = useState<number | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const jump = (ts: number) => {
    setOpenTranscript(true);
    const i = m.transcript.findIndex((s) => s.start_sec === ts);
    setFlash(i);
    requestAnimationFrame(() => document.getElementById(`seg-${m.id}-${i}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const caseLink = (ref: string | null) => {
    if (!ref) return null;
    const id = m.case_refs[ref];
    return id ? (
      <Link href={`/admin/case/${id}`} className="font-mono text-xs text-primary underline-offset-4 hover:underline">
        {ref}
      </Link>
    ) : (
      <span className="font-mono text-xs text-muted-foreground" title="Vorgang in dieser Demo nicht vorhanden">
        {ref}
      </span>
    );
  };

  const decisions = m.items.filter((i) => i.kind === "decision");
  const tasks = m.items.filter((i) => i.kind === "task");
  const detected = m.items.filter((i) => (TEMPLATE_KINDS as readonly string[]).includes(i.kind));
  const nothing = TEMPLATE_KINDS.filter((k) => !detected.some((i) => i.kind === k));

  return (
    <div className="space-y-5">
      {show("header") ? (
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted-foreground">{m.ref}</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">{m.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {MEETING_TYPE_DE[m.type]} · {fmtDate(m.started_at)} · Dauer <span className="font-mono">{fmtClock(m.duration_sec)}</span>
            </p>
            {m.participants.length ? (
              <p className="mt-1 text-sm text-muted-foreground">Teilnehmer: {m.participants.map((p) => `${p.name} (${p.role})`).join(", ")}</p>
            ) : null}
            {languages.length ? (
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                Sprachen:
                {languages.map((l) => (
                  <LangBadge key={l} code={l} />
                ))}
              </p>
            ) : null}
          </div>
          {actions}
        </header>
      ) : null}

      {m.notice && show("header") ? (
        <p role="status" className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground">
          {m.notice}
        </p>
      ) : null}

      {show("summary") ? (
        <Section title="Zusammenfassung">
          {m.summary.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground marker:text-muted-foreground">
              {m.summary.slice(0, 5).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <Empty>Keine Zusammenfassung.</Empty>
          )}
        </Section>
      ) : null}

      {show("decisions") ? (
        <Section title="Entscheidungen">
          {decisions.length ? (
            <ul className="space-y-2">
              {decisions.map((d) => (
                <li key={d.id} className="text-sm text-foreground">
                  {d.text} <Evidence item={d} onJump={jump} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Keine Entscheidungen festgehalten.</Empty>
          )}
        </Section>
      ) : null}

      {show("tasks") ? (
        <Section title="Aufgaben" icon={<ListChecks className="size-4" aria-hidden />}>
          {tasks.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-normal">Was</th>
                  <th className="pb-2 font-normal">Wer</th>
                  <th className="pb-2 font-normal">Bis</th>
                  <th className="pb-2 font-normal">Gewerk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tasks.map((t) => (
                  <tr key={t.id} className="align-top">
                    <td className="py-2 pr-3 text-foreground">
                      {t.text}
                      <div>
                        <Evidence item={t} onJump={jump} />
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-foreground">{t.owner ?? "–"}</td>
                    <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap text-foreground">{t.due_date ? fmtDate(t.due_date) : "–"}</td>
                    <td className="py-2 text-muted-foreground">{t.trade ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>Keine Aufgaben.</Empty>
          )}
        </Section>
      ) : null}

      {show("detected") ? (
        <Section title="Erkannt & erstellt" note="Nur Vorlagen mit Beleg im Gespräch">
          {detected.length ? (
            <ul className="space-y-2.5">
              {detected.map((i) => (
                <DetectedRow key={i.id} item={i} link={caseLink(i.case_ref)} onJump={jump} dense={dense} />
              ))}
            </ul>
          ) : (
            <Empty>Keine Vorlage betroffen.</Empty>
          )}
        </Section>
      ) : null}

      {show("nothing") && nothing.length ? (
        <Section title="Nichts erkannt">
          <ul className="flex flex-wrap gap-1.5">
            {nothing.map((k) => (
              <li key={k} className="flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                <CircleDashed className="size-3" aria-hidden />
                {TEMPLATE_DE[k].nothing}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {show("changes") ? (
        <Section title="Änderungen durch dieses Meeting">
          {m.changes.length ? (
            <ul className="space-y-1.5">
              {m.changes.map((c, idx) => (
                <ChangeRow key={idx} change={c} link={caseLink(c.case_ref)} />
              ))}
            </ul>
          ) : (
            <Empty>Keine Änderungen.</Empty>
          )}
        </Section>
      ) : null}

      {show("transcript") ? (
        <section className="rounded-xl border border-border bg-background">
          <button
            type="button"
            aria-expanded={openTranscript}
            onClick={() => setOpenTranscript((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl px-5 py-3.5 text-left text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Transkript <span className="ml-1.5 font-normal text-muted-foreground">({m.transcript.length} Abschnitte)</span>
            <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform duration-200", openTranscript && "rotate-180")} aria-hidden />
          </button>
          {openTranscript ? (
            <div className="border-t border-border">
              <div className="flex items-center justify-between gap-3 px-5 pt-3">
                <p className="text-xs text-muted-foreground">Jeder Abschnitt in der gesprochenen Sprache und auf Deutsch.</p>
                <div role="group" aria-label="Transkript anzeigen" className="inline-flex rounded-lg border border-border p-0.5">
                  {TRANSCRIPT_VIEWS.map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={view === v}
                      onClick={() => setView(v)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div ref={transcriptRef} className="max-h-[480px] space-y-1 overflow-y-auto px-5 py-3">
                {m.transcript.map((s, i) => {
                  const foreign = !!s.language && s.language !== "de";
                  const unsure = isUncertain(s);
                  return (
                    <div
                      key={i}
                      id={`seg-${m.id}-${i}`}
                      className={cn("grid grid-cols-[3.5rem_10rem_1fr] gap-2 rounded-md px-1 py-1.5 text-sm", flash === i && "bg-primary/10")}
                    >
                      <span className="pt-0.5 font-mono text-xs text-muted-foreground">{fmtClock(s.start_sec)}</span>
                      <span className="flex min-w-0 flex-wrap items-start gap-1.5 text-muted-foreground">
                        <span className="truncate">{s.speaker}</span>
                        {s.language ? <LangBadge code={s.language} /> : null}
                      </span>
                      <div className="min-w-0">
                        {view !== "original" || !foreign ? <p lang="de" className="text-foreground">{segmentDe(s)}</p> : null}
                        {foreign && view !== "deutsch" ? (
                          <p lang={s.language ?? undefined} className={view === "original" ? "text-foreground" : "mt-0.5 text-xs text-muted-foreground"}>
                            {s.text_original}
                          </p>
                        ) : null}
                        {unsure ? (
                          <p className="mt-1 text-xs font-medium text-light-yellow-text">Unsicher erkannt oder übersetzt: nicht allein als Beleg für eine Vorlage verwendet</p>
                        ) : null}
                        {s.notes.map((n) => (
                          <p key={n} className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                            {n}
                          </p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

type TranscriptView = "deutsch" | "original" | "beide";
const TRANSCRIPT_VIEWS: [TranscriptView, string][] = [
  ["deutsch", "Deutsch"],
  ["original", "Original"],
  ["beide", "Beide"],
];

/** "PL" with the language name for screen readers and on hover. */
function LangBadge({ code }: { code: string }) {
  return (
    <abbr
      title={languageName(code)}
      className="inline-flex h-[18px] items-center rounded border border-border bg-background px-1 font-mono text-[10px] font-medium text-muted-foreground no-underline"
    >
      {code.toUpperCase()}
    </abbr>
  );
}

function Section({ title, note, icon, children }: { title: string; note?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-background px-5 py-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
        {note ? <span className="font-normal text-muted-foreground">· {note}</span> : null}
      </h2>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

/** German quote, the words as said (with language), speaker and timestamp (click jumps to the transcript). */
function Evidence({ item, onJump }: { item: MeetingItem; onJump: (ts: number) => void }) {
  const foreign = item.quote_language !== "de" && item.quote_original && item.quote_original !== item.quote_de;
  return (
    <span className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
      <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
        <Quote className="size-3 translate-y-0.5" aria-hidden />
        <span lang="de" className="italic">„{item.quote_de.replace(/[.]$/, "")}“</span>
        <span>– {item.speaker},</span>
        <button
          type="button"
          onClick={() => onJump(item.ts_sec)}
          className="rounded font-mono text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Im Transkript bei ${fmtClock(item.ts_sec)} zeigen`}
        >
          {fmtClock(item.ts_sec)}
        </button>
      </span>
      {foreign ? (
        <span className="inline-flex flex-wrap items-center gap-x-1.5 pl-[18px]">
          <LangBadge code={item.quote_language} />
          <span lang={item.quote_language}>„{item.quote_original.replace(/[.]$/, "")}“</span>
        </span>
      ) : null}
      {item.depends ? (
        <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
          <Link2 className="size-3 translate-y-0.5" aria-hidden />
          <span>
            Voraussetzung für: „{item.depends.text_de.replace(/[.]$/, "")}“ – {item.depends.speaker}, <span className="font-mono">{fmtClock(item.depends.ts_sec)}</span>
          </span>
        </span>
      ) : null}
    </span>
  );
}

function DetectedRow({ item, link, onJump, dense }: { item: MeetingItem; link: ReactNode; onJump: (ts: number) => void; dense: boolean }) {
  const t = TEMPLATE_DE[item.kind as TemplateKind];
  const action =
    item.case_action === "uncertain"
      ? "nicht erstellt: Beleg unsicher erkannt oder übersetzt, bitte prüfen"
      : item.case_action === "existing"
      ? "bereits vorhanden"
      : item.case_action === "noop"
        ? "festgehalten, kein Eintrag im Terminplan geändert"
        : item.updated_case_id
          ? "aktualisiert"
          : item.created_case_id
            ? "Entwurf"
            : item.kind === "termin"
              ? "Terminplan angepasst"
              : "festgehalten";
  return (
    <li className="rounded-lg border border-border px-3.5 py-2.5">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium text-foreground">{t.title}</span>
        <span className={cn("text-xs", item.case_action === "uncertain" ? "font-medium text-light-yellow-text" : "text-muted-foreground")}>{action}</span>
        <span className="ml-auto">{link}</span>
      </p>
      {dense ? null : (
        <>
          <p className="mt-0.5 text-sm text-foreground">{item.text}</p>
          <Evidence item={item} onJump={onJump} />
        </>
      )}
    </li>
  );
}

function ChangeRow({ change, link }: { change: MeetingChange; link: ReactNode }) {
  const Icon = change.kind === "case_created" ? FilePlus2 : change.kind === "case_updated" ? FilePen : change.kind === "schedule_updated" ? CalendarClock : ListChecks;
  // "Neuer Entwurf KL-2026-0043: …": the reference becomes the link, in place.
  const [before, after] = change.case_ref && change.text_de.includes(change.case_ref) ? change.text_de.split(change.case_ref) : [change.text_de, null];
  return (
    <li className="flex items-start gap-2.5 text-sm text-foreground">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>
        {before}
        {after !== null ? (
          <>
            {link}
            {after}
          </>
        ) : null}
      </span>
    </li>
  );
}
