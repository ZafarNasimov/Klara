import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import styles from "./StaticSpotlight.module.css";

/** The light layer is 4% larger than its parent on every side (see the CSS). */
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

/** Pure-CSS spotlight: a fixed radial gradient, no mouse tracking. */
export function StaticSpotlight({
  className,
  x = 70,
  y = 35,
  radius = 600,
  intensity = 0.1,
  visible = true,
}: StaticSpotlightProps) {
  return (
    <div
      aria-hidden
      className={cn(styles.spotlight, visible && styles.visible, className)}
      style={
        {
          "--spot-x": toBox(x),
          "--spot-y": toBox(y),
          "--spot-r": radius,
          "--spot-a": intensity,
        } as CSSProperties
      }
    />
  );
}
