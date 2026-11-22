"use client";
// Which site the pointer (or focus) is on, shared by the map, the site list,
// the heatmap and "Handlungsbedarf": hovering one highlights it everywhere.
// Widgets mark site elements with data-site="<project id>" and attach
// siteHoverHandlers() to a container (event delegation, no per-item handlers).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

export type HoverSource = "map" | "list" | "heat" | "actions";
export type SiteHover = { id: string; src: HoverSource } | null;
type Ctx = {
  hover: SiteHover;
  /** `now` skips the short leave delay (Esc). */
  set: (id: string | null, src: HoverSource, now?: boolean) => void;
};

const SiteHoverContext = createContext<Ctx>({ hover: null, set: () => {} });

/** Leaving waits a moment, so the pointer can travel from a marker to its popover. */
const LEAVE_MS = 140;

export function SiteHoverProvider({ children }: { children: ReactNode }) {
  const [hover, setHover] = useState<SiteHover>(null);
  const timer = useRef<number | undefined>(undefined);
  const set = useCallback(
    (id: string | null, src: HoverSource, now = false) => {
      window.clearTimeout(timer.current);
      if (id)
        setHover((h) => (h?.id === id && h.src === src ? h : { id, src }));
      else if (now) setHover(null);
      else timer.current = window.setTimeout(() => setHover(null), LEAVE_MS);
    },
    [],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const value = useMemo(() => ({ hover, set }), [hover, set]);
  return (
    <SiteHoverContext.Provider value={value}>
      {children}
    </SiteHoverContext.Provider>
  );
}

export const useSiteHover = () => useContext(SiteHoverContext);

const siteOf = (t: EventTarget | null) =>
  t instanceof Element
    ? (t.closest("[data-site]")?.getAttribute("data-site") ?? null)
    : null;

/** Pointer and focus handlers for a container whose items carry data-site. */
export function siteHoverHandlers(set: Ctx["set"], src: HoverSource) {
  return {
    onPointerOver: (e: PointerEvent) => set(siteOf(e.target), src),
    onPointerLeave: () => set(null, src),
    onFocus: (e: FocusEvent) => set(siteOf(e.target), src),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Escape") set(null, src, true);
    },
    onBlur: (e: FocusEvent) => {
      if (!siteOf(e.relatedTarget)) set(null, src);
    },
  };
}

/** For an item of site `id`: is another site highlighted (dim me), or this one (emphasise me)? */
export function hoverState(hover: SiteHover, id: string) {
  return { active: hover?.id === id, dimmed: !!hover && hover.id !== id };
}
