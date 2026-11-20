// The letter as the office sees it before sending: the same DocBody that
// renders to PDF and DOCX, laid out like DIN 5008 page 1. Gaps show as
// amber "[fehlt: …]" (DESIGN.md: amber = missing).
import { Fragment } from "react";
import type { DocBlock, DocBody } from "@/lib/documents/types";
import { fmtDate } from "@/lib/labels";
import { cn } from "@/lib/utils";

const dateDe = (day: string) => fmtDate(/^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T12:00:00Z` : day);

function Rich({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\[fehlt: [^\]]+\])/g)
        .filter(Boolean)
        .map((p, i) =>
          p.startsWith("[fehlt:") ? (
            <mark key={i} className="rounded-sm bg-amber-50 px-0.5 font-semibold text-light-yellow-text">
              {p}
            </mark>
          ) : (
            <Fragment key={i}>{p}</Fragment>
          ),
        )}
    </>
  );
}

function Block({ b }: { b: DocBlock }) {
  switch (b.kind) {
    case "p":
      return (
        <p>
          <Rich text={b.text} />
        </p>
      );
    case "quote":
      return (
        <blockquote className="pl-[8%] italic">
          <Rich text={b.text} />
        </blockquote>
      );
    case "bullets":
      return (
        <ul className="space-y-1 pl-[4%]">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden>–</span>
              <span>
                <Rich text={it} />
              </span>
            </li>
          ))}
        </ul>
      );
    case "facts":
      return (
        <dl className="grid grid-cols-[34%_1fr] gap-x-4 gap-y-1">
          {b.rows.map((r) => (
            <Fragment key={r.label}>
              <dt className="text-zinc-600">{r.label}</dt>
              <dd>
                <Rich text={r.value} />
              </dd>
            </Fragment>
          ))}
        </dl>
      );
  }
}

export function LetterPreview({ body, className }: { body: DocBody; className?: string }) {
  const a = body.addressee;
  return (
    <article
      aria-label={`Schreiben ${body.reference}`}
      className={cn(
        "mx-auto aspect-[210/297] w-full max-w-[720px] overflow-hidden rounded-sm border border-border bg-white px-[11.9%] pt-[8.5%] pb-[9.5%] pr-[9.5%] text-[13px] leading-[1.45] text-zinc-900 shadow-[0_1px_2px_rgb(24_24_27/0.06),0_8px_24px_-8px_rgb(24_24_27/0.12)]",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-6 border-b-2 border-primary pb-2">
        <p className="text-[19px] font-semibold tracking-tight">{body.sender.name}</p>
        <p className="text-right text-[11px] text-zinc-600">
          {body.sender.address}
          <br />
          Bauleitung
        </p>
      </header>

      <div className="mt-8 grid grid-cols-[1fr_42%] gap-6">
        <address className="not-italic">
          <p className="mb-1.5 border-b border-zinc-200 pb-0.5 text-[10px] text-zinc-600">
            {body.sender.name}, {body.sender.address}
          </p>
          {a ? (
            <>
              {a.organisation ? <p>{a.organisation}</p> : null}
              <p>{a.name}</p>
              {a.address
                ? a.address.split(/,\s*(?=\d{5})/).map((l) => (
                    <p key={l}>{l}</p>
                  ))
                : null}
            </>
          ) : (
            <Rich text="[fehlt: Adressat]" />
          )}
        </address>
        <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-0.5 text-[12px]">
          <dt className="text-zinc-600">Unser Zeichen</dt>
          <dd className="font-mono">{body.reference}</dd>
          <dt className="text-zinc-600">Datum</dt>
          <dd className="font-mono">{dateDe(body.date)}</dd>
          {body.cc.length ? (
            <>
              <dt className="mt-1.5 text-zinc-600">Nachrichtlich</dt>
              <dd className="mt-1.5">
                {body.cc.map((p) => (
                  <span key={p.name} className="block">
                    {[p.name, p.organisation].filter(Boolean).join(", ")}
                  </span>
                ))}
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      <h2 className="mt-8 font-semibold">{body.subject}</h2>
      <dl className="mt-1.5 grid grid-cols-[28%_1fr] gap-x-3 text-[12px]">
        {body.refs.map((r) => (
          <Fragment key={r.label}>
            <dt className="text-zinc-600">{r.label}</dt>
            <dd>{r.value}</dd>
          </Fragment>
        ))}
      </dl>

      <div className="mt-5 space-y-2.5">
        <p>{body.salutation}</p>
        {body.blocks.map((b, i) => (
          <Block key={i} b={b} />
        ))}
        <div className="pt-1">
          <p>{body.closing}</p>
          <p className="mt-9">{body.signatory.name}</p>
          <p className="text-[12px] text-zinc-600">
            {body.signatory.role}, {body.signatory.company}
          </p>
        </div>
      </div>
    </article>
  );
}
