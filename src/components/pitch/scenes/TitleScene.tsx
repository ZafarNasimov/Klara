"use client";

import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { KlaraRobot, type KlaraRobotHandle } from "../KlaraRobot";
import { StaticSpotlight } from "../StaticSpotlight";
import { DARK_BG, EASE_OUT, u } from "../stage";
import { ExitBlur, FadeUp, RevealWords, scheduleGlances, SILVER_TEXT, Stage, type SceneProps } from "./scene-parts";

/** Pain points as stat rows (spec update 2026-11-22), revealed together by one click. */
export const TITLE_STATS = [
  { big: "€143k", line: "of revenue to earn back one lost €10,000 claim — at a 7 % average margin." },
  { big: "0 days", line: "of extra time, as a rule, without a written Behinderungsanzeige (§ 6 Abs. 1 VOB/B)." },
  { big: "80 %", line: "of site managers already work beyond their contract. Documentation is the first thing that slips." },
] as const;

const SOURCES =
  "Sources: HDB Brancheninfo Bau 03/2026 (Bauhauptgewerbe margin 2024: 7.0 %) · § 6 Abs. 1 VOB/B · Helmus et al., BBB 2023 (site manager survey)";

/**
 * Robot box in design px, centred on the right column (45%). Wider than the
 * column so the hands never touch its edge; the box edges fade out.
 * The PNG fallback is captured at exactly this size.
 */
export const ROBOT_BOX = { left: 948, top: 30, width: 1080, height: 1020 } as const;
/** One press: the rows land this far apart (s), as the lines of scene 6b do. */
const ROW_GAP = 0.9;
/** Auto mode: they follow the subline 1.2 s apart. */
const AUTO_GAP = 1.2;

/** Light centre in % of the stage: just behind the robot's head and shoulders. */
const SPOT = { x: 77, y: 30 };

/**
 * Scene 1 – title. Dark, text left (~55%), Klara right (~45%).
 * Click mode: one press (step 1) brings the three stat rows, 0.9 s apart.
 * Auto mode: they follow the subline 1.2 s apart.
 */
export function TitleScene({ phase, step, revealMode, headRef, robotPaused }: SceneProps) {
  const show = phase !== "standby";
  const auto = revealMode === "auto";
  const rootRef = useRef<HTMLElement>(null);
  const robotRef = useRef<KlaraRobotHandle>(null);

  // Klara reads along: the headline first, then each pain point as it lands.
  useEffect(() => {
    if (phase !== "enter") return;
    const cues: [string, number][] = auto
      ? [["headline", 400], ["point-2", 1400], ["audience", 3200]]
      : step === 0
        ? [["headline", 400]]
        : TITLE_STATS.map((_, i): [string, number] => [`point-${i}`, 150 + i * ROW_GAP * 1000]);
    return scheduleGlances(rootRef.current, robotRef.current, cues);
  }, [phase, step, auto]);

  return (
    <section
      ref={rootRef}
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
          <KlaraRobot ref={robotRef} className="size-full" headRef={headRef} paused={robotPaused} />
        </motion.div>

        <ExitBlur
          phase={phase}
          className="absolute top-0 bottom-0 flex flex-col justify-center"
          style={{ left: u(160), width: u(780), paddingBottom: u(40) }}
        >
          <motion.p
            className="font-medium uppercase tracking-[0.1em] text-zinc-400"
            style={{ fontSize: u(14) }}
            initial={{ opacity: 0 }}
            animate={{ opacity: show ? 1 : 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            Team Build Different
          </motion.p>

          <h1
            data-gaze="headline"
            className="font-bold leading-[0.95] tracking-[-0.04em]"
            style={{ fontSize: u(132), marginTop: u(28) }}
          >
            <RevealWords text="Ask Klara" show={show} delay={0.08} stagger={0.04} wordClassName={SILVER_TEXT} />
          </h1>

          <FadeUp as="p" show={show} delay={0.32} className="leading-[1.3] text-neutral-200" style={{ fontSize: u(32), marginTop: u(32) }}>
            The operating system for construction companies.
          </FadeUp>
          <FadeUp as="p" show={show} delay={0.4} className="leading-[1.4] text-neutral-500" style={{ fontSize: u(20), marginTop: u(10) }}>
            Calls · Meetings · Emails → reports, notices, dashboards
          </FadeUp>

          <ul className="flex flex-col" style={{ marginTop: u(48) }}>
            {TITLE_STATS.map((stat, i) => (
              <FadeUp
                key={stat.big}
                as="li"
                gaze={`point-${i}`}
                show={show && (auto || step >= 1)}
                delay={auto ? 0.6 + i * AUTO_GAP : i * ROW_GAP}
                duration={0.6}
                className="grid items-center border-t border-neutral-800"
                style={{ gridTemplateColumns: `${u(236)} 1fr`, columnGap: u(24), paddingBlock: u(18) }}
              >
                {/* Same size and weight for all three; the column fits "€143k" and "0 days" on one line. */}
                <span className="font-mono font-medium tracking-[-0.03em] whitespace-nowrap [word-spacing:-0.2em] text-neutral-50" style={{ fontSize: u(56), lineHeight: 1 }}>
                  {stat.big}
                </span>
                <span className="text-pretty text-neutral-300" style={{ fontSize: u(22), lineHeight: 1.4 }}>
                  {stat.line}
                </span>
              </FadeUp>
            ))}
          </ul>

          <motion.p
            className="absolute text-pretty text-zinc-600"
            style={{ left: 0, right: 0, bottom: u(28), fontSize: u(12), lineHeight: 1.5 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: show ? 1 : 0 }}
            transition={{ duration: 0.6, ease: EASE_OUT, delay: show ? 0.8 : 0 }}
          >
            {SOURCES}
          </motion.p>
        </ExitBlur>
      </Stage>
    </section>
  );
}
