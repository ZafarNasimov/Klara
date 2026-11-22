"use client";
// "Baustellen" card: an offline map of Munich (left) and the sites as a list
// (right). Hover or focus on a marker or a row highlights that site here, in
// the heatmap and in "Handlungsbedarf" (site-hover.tsx); a click opens the
// site's dashboard. Live: a site whose numbers change ripples once and fades
// to its new colour; an open Behinderungsanzeige keeps a slow ring.
// Status colours and thresholds are the heatmap's (worst trade).
import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import type {
  CellStatus,
  DashboardView,
  SiteSummary,
} from "@/lib/dashboard/compute";
import { $t, $tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  BOUNDS,
  DISTRICT_CENTROIDS,
  DISTRICT_NAMES,
  DISTRICTS,
  ISAR_LABEL,
  ISAR_SMOOTH,
  OUTLINE,
  RING,
  RING_LABEL,
  districtAt,
  project,
} from "./munich-map";
import {
  hoverState,
  siteHoverHandlers,
  useSiteHover,
  type SiteHover,
} from "./site-hover";
import { visibleChips } from "./chip-layout";
import { Empty, Shape } from "./widgets";

const EASE = [0.23, 1, 0.32, 1] as const;
type Status = Exclude<CellStatus, "none">;
const BG: Record<Status, string> = {
  green: "bg-light-green",
  amber: "bg-light-yellow",
  red: "bg-light-red",
};
const RING_CLS: Record<Status, string> = {
  green: "ring-light-green/30",
  amber: "ring-light-yellow/30",
  red: "ring-light-red/30",
};
const BORDER: Record<Status, string> = {
  green: "border-light-green",
  amber: "border-light-yellow",
  red: "border-light-red",
};
const TEXT: Record<Status, string> = {
  green: "text-light-green-text",
  amber: "text-light-yellow-text",
  red: "text-light-red-text",
};

const statusOf = (s: SiteSummary): Status =>
  s.status === "none" ? "green" : s.status;
const href = (s: SiteSummary) => `/admin/project/${s.id}`;
const districtOf = (s: SiteSummary) => {
  const [x, y] = project(s.lat, s.lng);
  const i = districtAt(x, y);
  return i < 0 ? null : DISTRICT_NAMES[i];
};

const hm = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});
const dayKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });
/** "16:40" today, else "19.11." */
const when = (iso: string, today: string) => {
  const d = dayKey.format(new Date(iso));
  return d === today
    ? hm.format(new Date(iso))
    : `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
};

/** "Baustelle B · Wohnanlage Riem, Haus 2: Behinderung offen, 1 offener Vorgang, 3 Verzugstage" */
function siteLabel(s: SiteSummary) {
  return [
    `${$t("Baustelle {code} · {name}", { code: s.code, name: s.name })}: ${$tx(s.status_text)}`,
    $t(s.open === 1 ? "{n} offener Vorgang" : "{n} offene Vorgänge", {
      n: s.open,
    }),
    $t("{n} Verzugstage", { n: s.delay }),
    ...(s.in_filter ? [] : [$t("nicht im Filter")]),
  ].join(", ");
}

/** Counts how often `sig` changed since mount (0 = never): drives one-off live effects. */
function useChanges(sig: string) {
  const [prev, setPrev] = useState(sig);
  const [n, setN] = useState(0);
  if (sig !== prev) {
    setPrev(sig);
    setN((x) => x + 1);
  }
  return n;
}

/**
 * Like useChanges, but changes that arrive while a ripple is still running
 * (one agent turn writes several rows, so the dashboard refetches twice) do
 * not restart it; the colour still follows.
 */
function useRipple(sig: string) {
  const [prev, setPrev] = useState(sig);
  const [n, setN] = useState(0);
  const [busy, setBusy] = useState(false);
  if (sig !== prev) {
    setPrev(sig);
    if (!busy) {
      setN((x) => x + 1);
      setBusy(true);
    }
  }
  useEffect(() => {
    if (!busy) return;
    const t = window.setTimeout(() => setBusy(false), 900);
    return () => window.clearTimeout(t);
  }, [busy]);
  return n;
}

/** "Baustelle B · Wohnanlage Riem, Haus 2: Behinderung offen" when a site's status changes live. */
function useStatusAnnouncement(sites: SiteSummary[]) {
  const sig = sites.map((s) => `${s.id}:${s.status_text}`).join("|");
  const [prev, setPrev] = useState({ sig, sites });
  const [said, setSaid] = useState("");
  if (sig !== prev.sig) {
    const changed = sites.filter((s) => {
      const before = prev.sites.find((p) => p.id === s.id);
      return before && before.status_text !== s.status_text;
    });
    setPrev({ sig, sites });
    if (changed.length)
      setSaid(
        changed
          .map(
            (s) =>
              `${$t("Baustelle {code} · {name}", { code: s.code, name: s.name })}: ${$tx(s.status_text)}`,
          )
          .join(". "),
      );
  }
  return said;
}

// ── Card body ───────────────────────────────────────────────────────────

export function SitesPanel({
  v,
  linkable,
}: {
  v: DashboardView;
  linkable: boolean;
}) {
  const { hover, set } = useSiteHover();
  const said = useStatusAnnouncement(v.site_map);
  return (
    <div className="@container h-full">
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
      <div className="flex h-full flex-col gap-3 @min-[44rem]:grid @min-[44rem]:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] @min-[44rem]:gap-4">
        <MapView v={v} linkable={linkable} hover={hover} set={set} />
        <SiteList v={v} linkable={linkable} hover={hover} set={set} />
      </div>
    </div>
  );
}

// ── Map ─────────────────────────────────────────────────────────────────

type View = { x: number; y: number; w: number; h: number };

/** The map area to show for a box of this aspect: the city, cropped to fill the box, always with every site. */
function fitView(aspect: number, pts: [number, number][]): View {
  const B = BOUNDS;
  if (!(aspect > 0) || !Number.isFinite(aspect)) return B;
  let [w, h] = aspect >= B.w / B.h ? [B.w, B.w / aspect] : [B.h * aspect, B.h];
  if (!pts.length)
    return { x: B.x + (B.w - w) / 2, y: B.y + (B.h - h) / 2, w, h };
  // Room around the sites for a pin and its label.
  const need = {
    x0: Math.min(...pts.map((p) => p[0])) - 50,
    x1: Math.max(...pts.map((p) => p[0])) + 50,
    y0: Math.min(...pts.map((p) => p[1])) - 40,
    y1: Math.max(...pts.map((p) => p[1])) + 40,
  };
  const grow = Math.max(1, (need.x1 - need.x0) / w, (need.y1 - need.y0) / h);
  w *= grow;
  h *= grow;
  const place = (
    lo: number,
    size: number,
    span: number,
    n0: number,
    n1: number,
  ) => {
    let p =
      size <= span
        ? Math.min(lo + span - size, Math.max(lo, (n0 + n1) / 2 - size / 2))
        : lo + (span - size) / 2;
    if (n0 < p) p = n0;
    if (n1 > p + size) p = n1 - size;
    return p;
  };
  return {
    x: place(B.x, w, B.w, need.x0, need.x1),
    y: place(B.y, h, B.h, need.y0, need.y1),
    w,
    h,
  };
}

function MapView({
  v,
  linkable,
  hover,
  set,
}: {
  v: DashboardView;
  linkable: boolean;
  hover: SiteHover;
  set: ReturnType<typeof useSiteHover>["set"];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: BOUNDS.w, h: BOUNDS.h });
  const [district, setDistrict] = useState(-1);
  const gid = useId().replace(/:/g, "");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth && el.clientHeight)
        setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = v.site_map.map((s) => project(s.lat, s.lng));
  const view = fitView(size.w / size.h, pts);
  const pos = (x: number, y: number) => ({
    left: `${((x - view.x) / view.w) * 100}%`,
    top: `${((y - view.y) / view.h) * 100}%`,
  });
  const RANK = { red: 3, amber: 2, green: 1, none: 1 } as const;
  const chips = visibleChips(
    v.site_map.map((s) => {
      const [x, y] = project(s.lat, s.lng);
      const fx = (x - view.x) / view.w;
      return {
        id: s.id,
        x: fx * size.w,
        y: ((y - view.y) / view.h) * size.h,
        text: s.open
          ? `${s.short} · ${$t("{n} offen", { n: s.open })}`
          : s.short,
        rank: s.in_filter ? RANK[s.status] : 0,
        flip: fx > 0.7,
      };
    }),
    size,
  );
  const active = hover ? v.site_map.find((s) => s.id === hover.id) : undefined;
  const activeDistrict = active
    ? districtAt(...project(active.lat, active.lng))
    : -1;

  return (
    <div
      ref={ref}
      className="relative h-[220px] min-h-0 shrink-0 overflow-visible rounded-lg bg-zinc-50 @min-[44rem]:h-full"
      {...siteHoverHandlers(set, "map")}
    >
      <svg
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="absolute inset-0 size-full overflow-hidden rounded-lg"
        aria-hidden
      >
        <defs>
          <linearGradient
            id={`isar-${gid}`}
            gradientUnits="userSpaceOnUse"
            x1="340"
            y1="475"
            x2="499"
            y2="29"
          >
            <stop offset="0" stopColor="var(--color-blue-300)" />
            <stop offset="1" stopColor="var(--color-blue-200)" />
          </linearGradient>
        </defs>
        <path
          d={OUTLINE}
          fill="white"
        />
        {DISTRICTS.map((d, i) => (
          <path
            key={i}
            d={d}
            className="transition-[fill] duration-150"
            fill={i === activeDistrict ? "var(--color-blue-50)" : "transparent"}
            stroke={
              i === activeDistrict
                ? "var(--color-blue-200)"
                : "var(--color-zinc-200)"
            }
            strokeWidth={1}
            strokeOpacity={i === activeDistrict ? 1 : 0.7}
            vectorEffect="non-scaling-stroke"
            pointerEvents="all"
            onPointerEnter={() => setDistrict(i)}
            onPointerLeave={() => setDistrict((x) => (x === i ? -1 : x))}
          />
        ))}
        <path
          d={OUTLINE}
          fill="none"
          stroke="var(--color-zinc-300)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <path
          d={RING}
          fill="none"
          stroke="var(--color-zinc-300)"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <path
          d={ISAR_SMOOTH}
          fill="none"
          stroke="var(--color-blue-50)"
          strokeWidth={6}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <path
          d={ISAR_SMOOTH}
          fill="none"
          stroke={`url(#isar-${gid})`}
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      </svg>

      {/* Cartographic labels (water in italic). */}
      <span
        aria-hidden
        className="pointer-events-none absolute origin-center text-[11px] font-medium text-blue-600 italic"
        style={{
          ...pos(ISAR_LABEL.x, ISAR_LABEL.y),
          transform: `translate(-50%, -50%) rotate(${ISAR_LABEL.angle}deg)`,
        }}
      >
        Isar
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-full text-[10px] whitespace-nowrap text-zinc-500"
        style={pos(RING_LABEL.x, RING_LABEL.y)}
      >
        Mittlerer Ring
      </span>
      {district >= 0 && !hover ? (
        <span
          aria-hidden
          className="pointer-events-none absolute z-10 max-w-36 -translate-x-1/2 -translate-y-1/2 rounded bg-white/90 px-1.5 py-0.5 text-center text-[11px] leading-tight text-zinc-600"
          style={pos(...DISTRICT_CENTROIDS[district])}
        >
          {DISTRICT_NAMES[district]}
        </span>
      ) : null}

      {v.site_map.map((s, i) => (
        <Marker
          key={s.id}
          s={s}
          index={i}
          chip={chips.get(s.id) ?? null}
          at={pos(...project(s.lat, s.lng))}
          view={view}
          mapH={size.h}
          linkable={linkable}
          hover={hover}
          today={v.today}
        />
      ))}
    </div>
  );
}

function Marker({
  s,
  index,
  chip,
  at,
  view,
  mapH,
  linkable,
  hover,
  today,
}: {
  s: SiteSummary;
  index: number;
  chip: "right" | "left" | null;
  at: { left: string; top: string };
  view: View;
  mapH: number;
  linkable: boolean;
  hover: SiteHover;
  today: string;
}) {
  const reduce = useReducedMotion();
  const status = statusOf(s);
  const { active, dimmed } = hoverState(hover, s.id);
  const changed = useRipple(
    `${s.status}|${s.open}|${s.delay}|${s.missing_today}|${s.hindrance}|${s.last_event?.at ?? ""}`,
  );
  const [x, y] = project(s.lat, s.lng);
  const fx = (x - view.x) / view.w;
  const fy = (y - view.y) / view.h;
  const flip = chip ? chip === "left" : fx > 0.7; // label side from the layout (towards the middle near the right edge)
  const popLeft = fx > 0.5; // the popover opens to the side with more room
  const ghost = !s.in_filter;
  const popId = `site-pop-${s.code}`;
  const showPop = active && hover?.src === "map";

  const body = (
    <>
      <span className="relative flex size-7 shrink-0 items-center justify-center">
        {s.hindrance && !ghost && !reduce ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full bg-light-red/30"
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 2.1, opacity: 0 }}
            transition={{
              duration: 2.4,
              ease: "easeOut",
              repeat: Infinity,
              repeatDelay: 0.8,
            }}
          />
        ) : null}
        {changed && !reduce ? <Ripple key={changed} status={status} /> : null}
        <motion.span
          animate={{ scale: active ? 1.15 : 1 }}
          transition={{ duration: 0.15, ease: EASE }}
          className={cn(
            "relative flex size-7 items-center justify-center rounded-full border-2 font-mono text-xs font-semibold transition-[background-color,box-shadow] duration-500",
            ghost
              ? "border-dashed border-zinc-300 bg-white text-zinc-500"
              : cn(
                  "border-white text-white shadow-[0_1px_2px_rgb(24_24_27/0.18),0_3px_8px_-2px_rgb(24_24_27/0.22)]",
                  BG[status],
                ),
            active && !ghost && cn("ring-4", RING_CLS[status]),
          )}
          data-pin={s.code}
          data-status={status}
          data-changed={changed || undefined}
        >
          {s.code}
        </motion.span>
      </span>
      {chip || active ? (
        <span
          className={cn(
            "rounded-md border border-zinc-200 px-1.5 py-0.5 text-xs whitespace-nowrap shadow-[0_1px_2px_rgb(24_24_27/0.06)]",
            ghost ? "bg-white/90 text-zinc-500" : "bg-white text-zinc-900",
            active || s.selected ? "font-semibold" : "font-medium",
          )}
        >
          {s.short}
          {s.open ? (
            <span className="font-normal text-zinc-600">
              {" "}
              · {$t("{n} offen", { n: s.open })}
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  );
  const row = cn(
    "absolute top-0 flex -translate-y-1/2 items-center gap-1.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
    flip ? "right-[-14px] flex-row-reverse" : "left-[-14px]",
  );

  return (
    <div
      className={cn("absolute size-0", active ? "z-20" : "z-10")}
      style={at}
      data-site={s.id}
    >
      <motion.div
        className={cn(
          "transition-opacity duration-150",
          dimmed && "opacity-50",
        )}
        initial={reduce ? false : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: EASE, delay: index * 0.08 }}
      >
        {linkable ? (
          <Link
            href={href(s)}
            aria-label={siteLabel(s)}
            aria-describedby={showPop ? popId : undefined}
            className={row}
          >
            {body}
          </Link>
        ) : (
          <span role="img" aria-label={siteLabel(s)} className={row}>
            {body}
          </span>
        )}
      </motion.div>
      {showPop ? (
        <Popover
          id={popId}
          s={s}
          left={popLeft}
          pinY={fy * mapH}
          mapH={mapH}
          linkable={linkable}
          today={today}
        />
      ) : null}
    </div>
  );
}

/** Two rings out from the pin, once (~1.2 s), when the site's numbers change. */
function Ripple({ status }: { status: Status }) {
  return (
    <>
      {[0, 0.22].map((delay) => (
        <motion.span
          key={delay}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full border-2",
            BORDER[status],
          )}
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{ duration: 0.95, delay, ease: EASE }}
        />
      ))}
    </>
  );
}

function Popover({
  id,
  s,
  left,
  pinY,
  mapH,
  linkable,
  today,
}: {
  id: string;
  s: SiteSummary;
  left: boolean;
  pinY: number;
  mapH: number;
  linkable: boolean;
  today: string;
}) {
  const reduce = useReducedMotion();
  // Beside the pin, vertically centred on it but kept inside the map.
  const ref = useRef<HTMLDivElement>(null);
  const [popH, setPopH] = useState(190);
  useLayoutEffect(() => {
    if (ref.current) setPopH(ref.current.offsetHeight);
  }, []);
  const top = Math.max(6, Math.min(mapH - popH - 6, pinY - popH / 2)) - pinY;
  const status = statusOf(s);
  const district = districtOf(s);
  const rows: [string, number][] = [
    [$t("Offene Vorgänge"), s.open],
    [$t("Verzugstage"), s.delay],
    [$t("Fehlende Berichte heute"), s.missing_today],
  ];
  return (
    <motion.div
      ref={ref}
      id={id}
      initial={reduce ? false : { opacity: 0, x: left ? 4 : -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15, ease: EASE }}
      style={{ top, ...(left ? { right: 24 } : { left: 24 }) }}
      className="absolute z-30 w-64 rounded-lg border border-border bg-background p-3 shadow-[0_8px_24px_-6px_rgb(24_24_27/0.18),0_1px_3px_rgb(24_24_27/0.08)]"
    >
      <p className="text-sm leading-5 font-medium text-foreground">{s.name}</p>
      <p className="text-xs text-muted-foreground">
        {s.contract}
        {district ? ` · ${district}` : ""}
      </p>
      <p
        className={cn(
          "mt-1.5 flex items-center gap-1.5 text-xs font-medium",
          TEXT[status],
        )}
      >
        <Shape status={status} />
        {$tx(s.status_text)}
      </p>
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 text-xs">
        {rows.map(([k, n]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd
              className={cn(
                "text-right font-mono tabular-nums",
                n ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {n}
            </dd>
          </div>
        ))}
      </dl>
      {s.last_event ? (
        <p className="mt-2 flex gap-2 border-t border-border pt-2 text-xs">
          <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
            {when(s.last_event.at, today)}
          </span>
          <span className="min-w-0 truncate text-foreground">
            {$tx(s.last_event.text)}
          </span>
        </p>
      ) : null}
      {linkable ? (
        <Link
          href={href(s)}
          tabIndex={-1}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 underline-offset-2 hover:underline"
        >
          {$t("Zur Baustelle")}
          <ArrowRight className="size-3" aria-hidden />
        </Link>
      ) : null}
    </motion.div>
  );
}

// ── List ────────────────────────────────────────────────────────────────

const COLS = "grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_2.75rem]";

function SiteList({
  v,
  linkable,
  hover,
  set,
}: {
  v: DashboardView;
  linkable: boolean;
  hover: SiteHover;
  set: ReturnType<typeof useSiteHover>["set"];
}) {
  if (!v.site_map.length)
    return <Empty>{$t("Keine Baustellen im Filter.")}</Empty>;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        aria-hidden
        className={cn(
          "grid shrink-0 items-end gap-2 border-b border-border px-2 pb-1.5 text-[11px] leading-none text-muted-foreground",
          COLS,
        )}
      >
        <span>{$t("Baustelle")}</span>
        <span className="text-right" title={$t("Offene Vorgänge")}>
          {$t("Offen")}
        </span>
        <span className="text-right" title={$t("Verzugstage")}>
          {$t("Verzug")}
        </span>
        <span className="text-right" title={$t("Teams heute")}>
          {$t("Teams")}
        </span>
      </div>
      <ul
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        aria-label={$t("Baustellen")}
        {...siteHoverHandlers(set, "list")}
      >
        {v.site_map.map((s) => (
          <SiteRow
            key={s.id}
            s={s}
            linkable={linkable}
            active={hoverState(hover, s.id).active}
          />
        ))}
      </ul>
    </div>
  );
}

function SiteRow({
  s,
  linkable,
  active,
}: {
  s: SiteSummary;
  linkable: boolean;
  active: boolean;
}) {
  const status = statusOf(s);
  const ghost = !s.in_filter;
  const district = districtOf(s);
  const cls = cn(
    "grid h-full items-center gap-2 rounded-lg px-2 py-1.5 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
    COLS,
    active ? "bg-muted" : linkable && "hover:bg-muted",
    ghost && "opacity-50",
  );
  const content = (
    <>
      <span className="flex min-w-0 items-start gap-2.5">
        <span
          aria-hidden
          className={cn(
            "mt-px flex size-6 shrink-0 items-center justify-center rounded-full border-2 font-mono text-[11px] font-semibold transition-colors duration-500",
            ghost
              ? "border-dashed border-zinc-300 bg-white text-zinc-500"
              : cn("border-transparent text-white", BG[status]),
          )}
        >
          {s.code}
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 text-sm leading-[18px] font-medium text-balance text-foreground">
            {s.name}
          </span>
          <span className="block truncate text-xs leading-4 text-muted-foreground">
            {district ?? s.short}
          </span>
          <span
            className={cn(
              "mt-1 flex items-center gap-1.5 text-xs leading-4 font-medium",
              TEXT[status],
            )}
          >
            <Shape status={status} />
            {$tx(s.status_text)}
          </span>
        </span>
      </span>
      <Metric value={s.open} />
      <Metric value={s.delay} plus />
      <Metric value={s.teams_today} />
    </>
  );
  return (
    <li
      data-site={s.id}
      className="flex-[1_0_auto] border-b border-border py-0.5 last:border-b-0"
      style={{ maxHeight: 108 }}
    >
      {linkable ? (
        <Link href={href(s)} aria-label={siteLabel(s)} className={cls}>
          {content}
        </Link>
      ) : (
        <div role="group" aria-label={siteLabel(s)} className={cls}>
          {content}
        </div>
      )}
    </li>
  );
}

/** A number in the list; flashes blue-50 once when it changes live (as the KPI tiles do). */
function Metric({ value, plus = false }: { value: number; plus?: boolean }) {
  const n = useChanges(String(value));
  return (
    <span
      className={cn(
        "relative justify-self-end rounded px-1 text-right font-mono text-sm tabular-nums",
        value ? "text-foreground" : "text-muted-foreground",
      )}
      data-changed={n || undefined}
    >
      {n ? (
        <motion.span
          key={n}
          aria-hidden
          className="absolute inset-0 rounded bg-blue-50"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: "easeOut", delay: 0.2 }}
        />
      ) : null}
      <span className="relative">
        {plus && value > 0 ? `+${value}` : value}
      </span>
    </span>
  );
}
