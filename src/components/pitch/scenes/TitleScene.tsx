"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { KlaraRobot } from "../KlaraRobot";
import { StaticSpotlight } from "../StaticSpotlight";
import { DARK_BG, EASE_OUT, u } from "../stage";
import { ExitBlur, FadeUp, RevealWords, SILVER_TEXT, Stage, type SceneProps } from "./scene-parts";

export const TITLE_POINTS = [
  "Formal notices are missing or sent too late",
  "Daily reports are incomplete",
  "Information is lost across calls, chats and emails",
] as const;

/**
 * Robot box in design px, centred on the right column (45%). Wider than the
 * column so the hands never touch its edge; the box edges fade out.
 * The PNG fallback is captured at exactly this size.
 */
export const ROBOT_BOX = { left: 948, top: 30, width: 1080, height: 1020 } as const;
/** Light centre in % of the stage: just behind the robot's head and shoulders. */
const SPOT = { x: 77, y: 30 };

/**
 * Scene 1 – title. Dark, text left (~55%), Klara right (~45%).
 * Click mode: the three pain points appear one per click (steps 1–3).
 * Auto mode: they follow the subline with a 120 ms stagger.
 */
export function TitleScene({ phase, step, revealMode, headRef, robotPaused }: SceneProps) {
  const show = phase !== "standby";
  const auto = revealMode === "auto";

  return (
    <section
      aria-label="Ask Klara – title"
      className="absolute inset-0 cursor-none overflow-hidden"
      style={{ background: DARK_BG }}
    >
      <Stage>
        <StaticSpotlight visible={show} x={SPOT.x} y={SPOT.y} />

        <motion.div
          className="absolute"
          style={{ left: u(ROBOT_BOX.left), top: u(ROBOT_BOX.top), width: u(ROBOT_BOX.width), height: u(ROBOT_BOX.height) }}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={show ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
        >
          <KlaraRobot className="size-full" headRef={headRef} paused={robotPaused} />
        </motion.div>

        <ExitBlur
          phase={phase}
          className="absolute top-0 bottom-0 flex flex-col justify-center"
          style={{ left: u(160), width: u(780), paddingBottom: u(40) }}
        >
          <motion.p
            className="font-medium uppercase tracking-[0.1em] text-zinc-500"
            style={{ fontSize: u(14) }}
            initial={{ opacity: 0 }}
            animate={{ opacity: show ? 1 : 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            Team Build Different
          </motion.p>

          <h1
            className="font-bold leading-[0.95] tracking-[-0.04em]"
            style={{ fontSize: u(132), marginTop: u(28) }}
          >
            <RevealWords text="Ask Klara" show={show} delay={0.08} stagger={0.04} wordClassName={SILVER_TEXT} />
          </h1>

          <FadeUp
            as="p"
            show={show}
            delay={0.32}
            className="leading-[1.35] text-neutral-300"
            style={{ fontSize: u(28), marginTop: u(36) }}
          >
            AI reporting for the whole construction site.
          </FadeUp>

          <ul className="flex flex-col" style={{ marginTop: u(72), gap: u(18) }}>
            {TITLE_POINTS.map((point, i) => (
              <FadeUp
                key={point}
                as="li"
                show={show && (auto || step > i)}
                delay={auto ? 0.6 + i * 0.12 : 0}
                duration={0.5}
                className={cn("flex items-center leading-[1.4] text-neutral-400")}
                style={{ fontSize: u(22), gap: u(20) }}
              >
                <span aria-hidden className="h-px shrink-0 bg-neutral-700" style={{ width: u(32) }} />
                {point}
              </FadeUp>
            ))}
          </ul>
        </ExitBlur>
      </Stage>
    </section>
  );
}
