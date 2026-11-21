"use client";

import { motion } from "motion/react";
import { Fragment, type ComponentType, type CSSProperties, type ReactNode, type RefCallback } from "react";
import { cn } from "@/lib/utils";
import type { KlaraRobotHandle } from "../KlaraRobot";
import { EASE_OUT, type ScenePhase, type SceneTheme, u } from "../stage";

export type RevealMode = "click" | "auto";

export type SceneProps = {
  phase: ScenePhase;
  /** In-scene reveals done so far (click mode). */
  step: number;
  revealMode: RevealMode;
  /** Dark scenes attach this to KlaraRobot's head anchor. */
  headRef?: RefCallback<HTMLDivElement>;
  /** True while a transition covers this scene's robot. */
  robotPaused?: boolean;
};

export type PitchSceneDef = {
  id: string;
  label: string;
  theme: SceneTheme;
  /** Clicks a scene consumes before the next click changes scene (click mode). */
  steps: number;
  Component: ComponentType<SceneProps>;
};

/** The 1920×1080 design box, centred and scaled to the window. */
export function Stage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("absolute inset-0 m-auto", className)}
      style={{ width: u(1920), height: u(1080) }}
    >
      {children}
    </div>
  );
}

const HIDDEN = { opacity: 0, y: 12, filter: "blur(6px)" };
const SHOWN = { opacity: 1, y: 0, filter: "blur(0px)" };
const GONE = { opacity: 0, y: 0, filter: "blur(6px)" };

/**
 * Content wrapper for the light scenes: fades in (y 12 → 0, blur 6 → 0) when
 * the scene enters and out (blur 0 → 6, 250 ms) when it leaves.
 */
export function SceneContent({
  phase,
  className,
  style,
  children,
}: {
  phase: ScenePhase;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const target = phase === "enter" ? SHOWN : phase === "exit" ? GONE : HIDDEN;
  return (
    <motion.div
      className={className}
      style={style}
      initial={HIDDEN}
      animate={target}
      transition={{ duration: phase === "exit" ? 0.25 : 0.5, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/** Fades a dark scene's text out (250 ms, blur 0 → 6 px) as the wipe starts. */
export function ExitBlur({ phase, children, className, style }: {
  phase: ScenePhase;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const leaving = phase === "exit";
  return (
    <motion.div
      className={className}
      style={style}
      initial={false}
      animate={leaving ? { opacity: 0, filter: "blur(6px)" } : { opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/** Fade up 12 px once `show` turns true. */
export function FadeUp({
  show,
  delay = 0,
  duration = 0.6,
  as = "div",
  gaze,
  className,
  style,
  children,
}: {
  show: boolean;
  delay?: number;
  duration?: number;
  as?: "div" | "p" | "li";
  /** Marks the element as a target for Klara's scripted glances. */
  gaze?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const Tag = motion[as];
  return (
    <Tag
      data-gaze={gaze}
      className={className}
      style={style}
      initial={{ opacity: 0, y: 12 }}
      animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={{ duration, ease: EASE_OUT, delay: show ? delay : 0 }}
    >
      {children}
    </Tag>
  );
}

/**
 * Word-by-word mask reveal: each word rises out of its own clip box.
 * The gradient (if any) goes on each word, so wrapped lines keep it too.
 */
export function RevealWords({
  text,
  show,
  delay = 0,
  stagger = 0.04,
  duration = 0.8,
  wordClassName,
}: {
  text: string;
  show: boolean;
  delay?: number;
  stagger?: number;
  duration?: number;
  wordClassName?: string;
}) {
  const words = text.split(" ");
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((word, i) => (
          <Fragment key={`${word}-${i}`}>
            {/* Padding keeps descenders and the tight tracking inside the clip. */}
            <span className="-mx-[0.05em] -mb-[0.2em] inline-block overflow-hidden px-[0.05em] pb-[0.2em] align-bottom">
              <motion.span
                className={cn("inline-block", wordClassName)}
                initial={{ y: "115%" }}
                animate={{ y: show ? "0%" : "115%" }}
                transition={{ duration, ease: EASE_OUT, delay: show ? delay + i * stagger : 0 }}
              >
                {word}
              </motion.span>
            </span>
            {i < words.length - 1 && " "}
          </Fragment>
        ))}
      </span>
    </>
  );
}

/**
 * Schedules Klara's glances for a scene: `[target, delayMs]` pairs, where the
 * target is a `data-gaze` key inside `root` or "audience". Cancels on change.
 */
export function scheduleGlances(
  root: HTMLElement | null,
  robot: KlaraRobotHandle | null,
  cues: [key: string, delayMs: number][],
) {
  const timers = cues.map(([key, delay]) =>
    window.setTimeout(() => {
      const target = key === "audience" ? "audience" : root?.querySelector(`[data-gaze="${key}"]`);
      if (target) robot?.glanceAt(target);
    }, delay),
  );
  return () => timers.forEach((t) => window.clearTimeout(t));
}

/** Silver text from the brief: neutral-50 → neutral-400, top to bottom. */
export const SILVER_TEXT = "bg-linear-to-b from-neutral-50 to-neutral-400 bg-clip-text text-transparent";
