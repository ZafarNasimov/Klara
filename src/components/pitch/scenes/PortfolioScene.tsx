"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import { Overview } from "@/components/dashboard/dashboard";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { DashboardView } from "@/lib/dashboard/compute";
import { useApi } from "@/lib/use-api";
import { DOC_REFERENCE } from "../pitch-story";
import { EASE_OUT, u } from "../stage";
import { appScaleVars, LightScene, PitchHeadline, useBeat, type SceneProps } from "./scene-parts";

/** The app's dashboard is laid out at this width; the box scales it onto the stage. */
const NATIVE_W = 1600;

/**
 * Scene 5 – portfolio: the REAL dashboard components, computed offline from
 * the seed by the same function as /admin. Step 1 is the moment after the
 * call: the Behinderungsanzeige from Scene 2 arrives, "Offene Vorgänge" goes
 * +1 and Elektro × Baustelle B turns red.
 */
export function PortfolioScene({ phase, step, revealMode }: SceneProps) {
  const beat = useBeat(phase, step, revealMode, [2600]);
  // The dashboard of a freshly reset demo, computed on the server from the seed (no database).
  const { data: views } = useApi<{ before: DashboardView; after: DashboardView }>("/api/dashboard/demo", { live: false, pollMs: 0 });
  const v = views ? (beat >= 1 ? views.after : views.before) : null;
  const hot = v?.heatmap.rows.flatMap((r) => r.cells.map((c) => ({ r, c }))).find(({ c }) => c.hindrance?.reference === DOC_REFERENCE);

  return (
    <LightScene label="Scene 5 – portfolio" phase={phase}>
      <PitchHeadline>See every site at a glance.</PitchHeadline>

      <FitBox left={160} top={196} width={1600} height={752}>
        <TooltipProvider>
          <div inert aria-hidden className="pointer-events-none">
            {v ? <Overview v={v} linkable={false} /> : null}
          </div>
        </TooltipProvider>
      </FitBox>

      <motion.p
        role="status"
        className="absolute flex items-center font-medium text-zinc-900"
        style={{ left: u(160), top: u(972), gap: u(14), fontSize: u(28) }}
        initial={{ opacity: 0, y: 8 }}
        animate={beat >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
      >
        <span aria-hidden className="rounded-[2px] bg-light-red" style={{ width: u(14), height: u(14) }} />
        <span>
          After the call: <span lang="de">{DOC_REFERENCE}</span> is on the dashboard, {hot ? `${hot.c.trade} on site ${hot.r.code}` : "the trade"} turns red
          {hot?.c.delay ? ` (+${hot.c.delay} days)` : ""}
        </span>
      </motion.p>
    </LightScene>
  );
}

/** App UI laid out at NATIVE_W px, scaled into a stage box, cropped with a soft bottom edge. */
function FitBox({ left, top, width, height, children }: { left: number; top: number; width: number; height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(el.getBoundingClientRect().width / NATIVE_W);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Inside the box the app's own sizes apply (1 unit = 1 px), the box scales the result.
  const native = { "--pitch-u": "1px", ...appScaleVars(1) } as CSSProperties;
  return (
    <div
      ref={ref}
      className="absolute overflow-hidden mask-[linear-gradient(to_bottom,#000_90%,transparent)]"
      style={{ left: u(left), top: u(top), width: u(width), height: u(height) }}
    >
      <div className="origin-top-left" style={{ ...native, width: NATIVE_W, transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}>
        {children}
      </div>
    </div>
  );
}
