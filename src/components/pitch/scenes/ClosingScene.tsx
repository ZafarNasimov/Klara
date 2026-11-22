"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { KlaraRobot, type KlaraRobotHandle } from "../KlaraRobot";
import { StaticSpotlight } from "../StaticSpotlight";
import { DARK_BG, u } from "../stage";
import { ExitBlur, FadeUp, RevealWords, scheduleGlances, SILVER_TEXT, Stage, type SceneProps } from "./scene-parts";
import { ROBOT_BOX } from "./TitleScene";

const SPOT = { x: 77, y: 30 };

/** "No lost money." */
const MONEY_PX = 88;
/**
 * Step 2: Klara steps right by SHIFT (with her light) and the block is FINAL_PX.
 * Measured on the 1920×1080 stage: "for construction companies." is 1129 px
 * at 88 px, so 948 px at 0.84× and ends at x = 1108 from x = 160. Klara's idle
 * animation reaches left to x ≈ 960 in that band; shifted by 200 that is
 * 1160, so the line stays ≥ 48 px clear at her furthest reach.
 */
const FINAL_SCALE = 0.84;
const FINAL_PX = MONEY_PX * FINAL_SCALE;
const SHIFT = 200;
const LEFT = 160;

/** Step 1 timing (s after the scene enters): the three lines, then the footer. */
const T = { line2: 0.9, money: 1.8, footer: 2.9 };
/** Auto mode: step 2 starts 2.5 s after "No lost money." has finished (3 words × 60 ms + 800 ms). */
const AUTO_STEP2_MS = (T.money + 2 * 0.06 + 0.8 + 2.5) * 1000;

/** Step 2: the three lines leave top to bottom, 60 ms apart, 350 ms, ease-in. */
const LEAVE_STAGGER = 0.06;
const LEAVE_S = 0.35;
/** The block enters 150 ms after the last line starts leaving. */
const ENTER_AT = 2 * LEAVE_STAGGER + 0.15;
const LINE2_AT = ENTER_AT + 0.12;
/** Footer 300 ms after line 2 ("for construction companies." = 3 words). */
const FOOTER2_AT = LINE2_AT + 2 * 0.06 + 0.8 + 0.3;

/** A step-1 line: leaves in step 2 (stagger top to bottom), returns at once on back. */
function Leave({ i, final, reduce, children }: { i: number; final: boolean; reduce: boolean; children: ReactNode }) {
  return (
    <motion.div
      initial={false}
      animate={final ? { opacity: 0, y: -12, filter: "blur(6px)" } : { opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={final && !reduce ? { duration: LEAVE_S, ease: "easeIn", delay: i * LEAVE_STAGGER } : { duration: 0 }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Scene 6b – close, two steps.
 * Step 1 (entering): "No missing reports." → "No missed notices." →
 * "No lost money." arrive one by one, then the footer.
 * Step 2 (one press): the three lines and the footer leave; Klara and her
 * light glide 200 px right; "The operating system / for construction
 * companies." enters in the style of "No lost money." (0.84×), vertically
 * centred, on the same x; the footer returns under it.
 * Back from step 2 shows step 1 without replaying its entrance. In auto mode
 * step 2 follows 2.5 s after "No lost money.".
 *
 * The robot is never faded in here: the light→dark wipe collapses onto it,
 * so it must already stand there when the wipe starts.
 */
export function ClosingScene({ phase, step, revealMode, headRef, robotPaused }: SceneProps) {
  const show = phase !== "standby";
  const auto = revealMode === "auto";
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const robotRef = useRef<KlaraRobotHandle>(null);

  // Auto mode runs step 2 by itself.
  const [autoStep, setAutoStep] = useState(0);
  useEffect(() => {
    if (!auto || phase !== "enter") return;
    const t = window.setTimeout(() => setAutoStep(1), AUTO_STEP2_MS);
    return () => window.clearTimeout(t);
  }, [auto, phase]);
  const final = (auto ? autoStep : step) >= 1;

  // Back from step 2: step 1 returns at once, without its entrance (a new visit plays it again).
  const [prev, setPrev] = useState({ final, phase });
  const [instant, setInstant] = useState(false);
  if (final !== prev.final || phase !== prev.phase) {
    setPrev({ final, phase });
    setInstant(final !== prev.final ? !final : false);
  }

  /** Step 2: a 700 ms ease-in-out glide while the lines change; back to step 1 at once. */
  const glide = final && !reduce && !instant ? "transform 700ms cubic-bezier(0.65, 0, 0.35, 1)" : "none";

  // She reads the two "No …" lines, then turns to the room; in step 2 no new glance.
  useEffect(() => {
    if (phase !== "enter" || final) return;
    return scheduleGlances(rootRef.current, robotRef.current, [
      ["line-1", 300],
      ["line-2", 1000],
      ["audience", 1900],
    ]);
  }, [phase, final]);

  return (
    <section
      ref={rootRef}
      aria-label="Ask Klara – close"
      className="absolute inset-0 cursor-none overflow-hidden"
      style={{ background: DARK_BG }}
    >
      <Stage>
        {/* Klara and her light glide right together for step 2 (back: at once). */}
        <div className="absolute inset-0" style={{ transform: final ? `translateX(${u(SHIFT)})` : "translateX(0)", transition: glide }}>
          <StaticSpotlight visible={show} x={SPOT.x} y={SPOT.y} />
        </div>

        <div
          className="absolute"
          data-robot
          style={{
            left: u(ROBOT_BOX.left),
            top: u(ROBOT_BOX.top),
            width: u(ROBOT_BOX.width),
            height: u(ROBOT_BOX.height),
            transform: final ? `translateX(${u(SHIFT)})` : "translateX(0)",
            transition: glide,
          }}
        >
          <KlaraRobot ref={robotRef} className="size-full" headRef={headRef} paused={robotPaused} />
        </div>

        <ExitBlur
          phase={phase}
          className="absolute top-0 bottom-0 flex flex-col justify-center"
          style={{ left: u(LEFT), width: u(780), paddingBottom: u(40) }}
        >
          {/* Step 1 */}
          <div aria-hidden={final || undefined}>
            <Leave final={final} reduce={!!reduce} i={0}>
              <FadeUp
                as="p"
                gaze="line-1"
                show={show}
                className="leading-[1.15] tracking-[-0.02em] text-neutral-300"
                style={{ fontSize: u(56) }}
              >
                No missing reports.
              </FadeUp>
            </Leave>
            <Leave final={final} reduce={!!reduce} i={1}>
              <FadeUp
                as="p"
                gaze="line-2"
                show={show}
                delay={instant ? 0 : T.line2}
                duration={instant ? 0 : undefined}
                className="leading-[1.15] tracking-[-0.02em] text-neutral-300"
                style={{ fontSize: u(56), marginTop: u(12) }}
              >
                No missed notices.
              </FadeUp>
            </Leave>
            <Leave final={final} reduce={!!reduce} i={2}>
              <p className="font-bold leading-[1.02] tracking-[-0.035em]" style={{ fontSize: u(MONEY_PX), marginTop: u(20) }}>
                <RevealWords text="No lost money." show={show} delay={instant ? 0 : T.money} stagger={0.06} wordClassName={SILVER_TEXT} />
              </p>
            </Leave>
            <motion.div
              initial={false}
              animate={{ opacity: final ? 0 : 1 }}
              transition={final && !reduce ? { duration: LEAVE_S, ease: "easeIn" } : { duration: 0 }}
            >
              <FadeUp
                as="p"
                show={show}
                delay={instant ? 0 : T.footer}
                duration={instant ? 0 : 0.5}
                className="text-zinc-400"
                style={{ fontSize: u(20), marginTop: u(56) }}
              >
                Ask Klara · Team Build Different
              </FadeUp>
            </motion.div>
          </div>
        </ExitBlur>

        {/* Step 2: vertically centred, same x; the footer hangs 48 px under the block. */}
        <ExitBlur phase={phase} className="absolute top-0 bottom-0 flex flex-col justify-center" style={{ left: u(LEFT), width: u(1000) }}>
          <div className="relative" data-final-block aria-hidden={!final || undefined}>
            <p className="font-bold leading-[1.02] tracking-[-0.035em] whitespace-nowrap" style={{ fontSize: u(FINAL_PX) }}>
              <RevealWords text="The operating system" show={show && final} delay={ENTER_AT} stagger={0.06} wordClassName={SILVER_TEXT} />
            </p>
            <p className="font-bold leading-[1.02] tracking-[-0.035em] whitespace-nowrap" style={{ fontSize: u(FINAL_PX) }}>
              <RevealWords text="for construction companies." show={show && final} delay={LINE2_AT} stagger={0.06} wordClassName={SILVER_TEXT} />
            </p>
            <FadeUp
              as="p"
              show={show && final}
              delay={FOOTER2_AT}
              duration={0.5}
              className="absolute left-0 whitespace-nowrap text-zinc-400"
              style={{ top: `calc(100% + ${u(48)})`, fontSize: u(20) }}
            >
              Ask Klara · Team Build Different
            </FadeUp>
          </div>
        </ExitBlur>
      </Stage>
    </section>
  );
}
