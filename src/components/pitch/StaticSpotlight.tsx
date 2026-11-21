"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "./stage";

// No CSS module on purpose: next.config.ts routes every *.css through the
// Tailwind loader as global CSS, so module class names come back undefined.

/** The light layer is 4% larger than its parent on every side (room for the drift). */
const BLEED = 4;
const toBox = (percentOfParent: number) =>
  `${((percentOfParent + BLEED) / (100 + 2 * BLEED)) * 100}%`;

export type StaticSpotlightProps = {
  className?: string;
  /** Centre of the light, in % of the parent box. */
  x?: number;
  y?: number;
  /** Radius in 1920×1080 design pixels. */
  radius?: number;
  /** Peak white opacity. */
  intensity?: number;
  /** Fades in when this turns true (scene enter). */
  visible?: boolean;
};

/**
 * Static light behind the robot: a fixed radial gradient, no pointer tracking.
 * On enter it fades in (900 ms) and settles once from a ≤1.5 % offset, then
 * stays still. Only opacity and transform animate (compositor).
 */
export function StaticSpotlight({
  className,
  x = 70,
  y = 35,
  radius = 600,
  intensity = 0.1,
  visible = true,
}: StaticSpotlightProps) {
  const hidden = { opacity: 0, x: "-1.5%", y: "1%" };
  return (
    <motion.div
      aria-hidden
      className={cn("pointer-events-none absolute", className)}
      style={{
        inset: `-${BLEED}%`,
        background: `radial-gradient(calc(var(--pitch-u, 1px) * ${radius}) circle at ${toBox(x)} ${toBox(y)}, rgb(255 255 255 / ${intensity}), transparent 60%)`,
      }}
      initial={hidden}
      animate={visible ? { opacity: 1, x: "0%", y: "0%" } : hidden}
      transition={{
        opacity: { duration: 0.9, ease: EASE_OUT },
        x: { duration: 9, ease: EASE_OUT },
        y: { duration: 9, ease: EASE_OUT },
      }}
    />
  );
}
