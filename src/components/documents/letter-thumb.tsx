"use client";
// Page 1 of a letter scaled to its container: the same LetterPreview the
// office reads, shrunk without reflowing (it is laid out at 720 px and scaled).
// The height of the frame decides how much of the page shows.
import { useLayoutEffect, useRef, useState } from "react";
import type { DocBody } from "@/lib/documents/types";
import { cn } from "@/lib/utils";
import { LetterPreview } from "./letter-preview";

/** Width of the HTML letter before it is scaled; A4 height at that width. */
const PAGE_W = 720;
const PAGE_H = (PAGE_W * 297) / 210;

/** `whole`: the frame grows to show the full page; otherwise the frame's height (className) cuts it. */
export function LetterThumb({
  body,
  href,
  className,
  label,
  whole = false,
}: {
  body: DocBody;
  href: string;
  className?: string;
  label?: string;
  whole?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / PAGE_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <a lang="de"
      href={href}
      target="_blank"
      rel="noreferrer"
      {...(label ? { "aria-label": label } : { tabIndex: -1, "aria-hidden": true })}
      className={cn(
        "block overflow-hidden rounded-xl border border-border bg-surface px-5 pt-5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div ref={ref} style={whole && scale ? { height: PAGE_H * scale } : undefined}>
        {scale ? (
          <div style={{ width: PAGE_W, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <LetterPreview body={body} className="max-w-none" />
          </div>
        ) : null}
      </div>
    </a>
  );
}
