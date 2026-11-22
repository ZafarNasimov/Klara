"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { DEMO_LIVE_START, startDemoMode } from "@/lib/demo";
import { storeRole } from "@/lib/role";
import { LIGHT_BG, u } from "../stage";
import { FadeUp, Stage, type SceneProps } from "./scene-parts";

/**
 * /demo scene 2: an empty light canvas with one button. Click or Enter opens
 * the live app (DEMO_LIVE_START) in this tab and turns demo mode on; Space
 * does nothing here (no accidental jump into the app).
 */
export function StartDemoScene({ phase }: SceneProps) {
  const router = useRouter();
  const live = phase === "enter";
  const buttonRef = useRef<HTMLButtonElement>(null);
  const started = useRef(false);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    startDemoMode();
    storeRole("polier"); // the call screen is the site manager's view
    // A previous "Finish demo" left the page background dark; the app is light.
    document.documentElement.style.background = "";
    document.body.style.background = "";
    router.push(DEMO_LIVE_START);
  }, [router]);

  useEffect(() => {
    router.prefetch(DEMO_LIVE_START);
  }, [router]);

  // Focus the button once the scene is on screen; Enter starts from anywhere on the slide.
  useEffect(() => {
    if (!live) return;
    buttonRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [live, start]);

  return (
    <section aria-label="Start live demo" className="absolute inset-0 overflow-hidden" style={{ background: LIGHT_BG }}>
      <Stage className="flex items-center justify-center">
        <FadeUp show={phase !== "standby"}>
          <button
            ref={buttonRef}
            type="button"
            onClick={start}
            tabIndex={live ? 0 : -1}
            className="inline-flex cursor-pointer items-center bg-blue-600 font-medium text-white shadow-sm outline-none transition-colors hover:bg-blue-700 focus-visible:ring-4 focus-visible:ring-ring/50 focus-visible:ring-offset-2 active:bg-blue-800"
            style={{
              height: u(64),
              paddingInline: u(32),
              gap: u(14),
              fontSize: u(22),
              borderRadius: u(12),
            }}
          >
            <motion.span
              aria-hidden
              className="block rounded-full bg-white"
              style={{ width: u(10), height: u(10) }}
              animate={{ opacity: [1, 0.4, 1], scale: [1, 0.8, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
            Start live demo
          </button>
        </FadeUp>
      </Stage>
    </section>
  );
}
