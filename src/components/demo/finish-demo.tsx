"use client";
// "Finish demo" in the office top bar (centred): a dark circle grows from the button to full
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

  // The close must be instant: its route at once; the robot scene and its image
  // fallback (~3 MB) a moment later, so they never slow down the page's own data.
  useEffect(() => {
    router.prefetch(target);
    const t = window.setTimeout(() => {
      preloadKlaraRobot();
      const img = new Image();
      img.src = KLARA_ROBOT_PNG;
    }, 3000);
    return () => window.clearTimeout(t);
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
    // A fresh token every time: Next keeps a visited page alive in the
    // background, so /demo (or /pitch) would otherwise resume where it was left
    // (e.g. on "Start live demo") instead of opening the close.
    router.push(`${target}&go=${Date.now()}`);
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={finish}
        className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-zinc-950 pr-4 pl-1.5 text-sm font-medium whitespace-nowrap text-white outline-none transition-[background-color,transform] duration-150 ease-out hover:bg-zinc-800 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]"
      >
        <KlaraAvatar size={24} />
        {label}
        <ArrowRight className="size-3.5" aria-hidden />
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
