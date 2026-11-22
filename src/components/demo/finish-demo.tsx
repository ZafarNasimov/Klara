"use client";
// "Finish demo" on Besprechungen: a dark circle grows from the button to full
// screen, then the closing slide replaces the page in the same tab, dark on
// dark (no white frame between). In demo mode (/demo) it leads to the demo's
// close; otherwise (TEMPORARY, until the live demo always starts from /demo)
// an "End demo" button leads to the pitch's scene 6b.
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight } from "lucide-react";
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { KLARA_ROBOT_PNG, preloadKlaraRobot } from "@/components/pitch/klara-robot-loader";
import { DARK_BG } from "@/components/pitch/stage";
import { DEMO_CLOSE, useDemoMode } from "@/lib/demo";
import { $t } from "@/lib/i18n";

/** TEMPORARY: the close outside demo mode (pitch scene 6b). Remove with ALWAYS_SHOW. */
const PITCH_CLOSE = "/pitch?scene=6b";
const ALWAYS_SHOW = true;

type Origin = { x: number; y: number; r: number };

export function FinishDemo() {
  const demo = useDemoMode();
  if (demo) return <FinishDemoButton target={DEMO_CLOSE} label="Finish demo" />;
  return ALWAYS_SHOW ? <FinishDemoButton target={PITCH_CLOSE} label={$t("Demo beenden")} /> : null;
}

function FinishDemoButton({ target, label }: { target: string; label: string }) {
  const router = useRouter();
  const ref = useRef<HTMLButtonElement>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);

  // The close must be instant: its route, the robot scene and its image fallback.
  useEffect(() => {
    router.prefetch(target);
    preloadKlaraRobot();
    const img = new Image();
    img.src = KLARA_ROBOT_PNG;
  }, [router, target]);

  const finish = () => {
    if (origin || !ref.current) return;
    const b = ref.current.getBoundingClientRect();
    const x = b.left + b.width / 2;
    const y = b.top + b.height / 2;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const r = Math.ceil(Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y))) + 2;
    setOrigin({ x, y, r });
  };

  const arrive = () => {
    // Keep the page dark under everything until the slide paints.
    document.documentElement.style.background = DARK_BG;
    document.body.style.background = DARK_BG;
    router.push(target);
  };

  return (
    <>
      {/* Room under the list, so the button never covers its last row. */}
      <div aria-hidden className="h-24 shrink-0" />
      <button
        ref={ref}
        type="button"
        onClick={finish}
        className="fixed right-8 bottom-8 z-40 inline-flex h-12 cursor-pointer items-center gap-2.5 rounded-full bg-zinc-950 pr-5 pl-3 text-base font-medium text-white shadow-lg shadow-zinc-950/15 outline-none transition-[transform,box-shadow,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:bg-zinc-800 hover:shadow-xl hover:shadow-zinc-950/20 focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-0"
      >
        <KlaraAvatar size={26} />
        {label}
        <ArrowRight className="size-4" aria-hidden />
      </button>
      {origin
        ? createPortal(
            <motion.div
              aria-hidden
              className="pointer-events-auto fixed inset-0 z-[100]"
              style={{ background: DARK_BG }}
              initial={{ clipPath: `circle(0px at ${origin.x}px ${origin.y}px)` }}
              animate={{ clipPath: `circle(${origin.r}px at ${origin.x}px ${origin.y}px)` }}
              transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }}
              onAnimationComplete={arrive}
            />,
            document.body,
          )
        : null}
    </>
  );
}
