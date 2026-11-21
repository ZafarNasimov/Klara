"use client";

import { KlaraRobot } from "../KlaraRobot";
import { StaticSpotlight } from "../StaticSpotlight";
import { DARK_BG, u } from "../stage";
import { ExitBlur, FadeUp, RevealWords, SILVER_TEXT, Stage, type SceneProps } from "./scene-parts";
import { ROBOT_BOX } from "./TitleScene";

const SPOT = { x: 77, y: 30 };

/**
 * Scene 6 – close. Same Klara and light as the title; the text arrives line by
 * line. Line 1 comes with the scene; in click mode lines 2 and 3 follow on
 * clicks (steps 1–2), in auto mode on a reading-pace timer.
 *
 * The robot is never faded in here: the light→dark wipe collapses onto it,
 * so it must already stand there when the wipe starts.
 */
export function ClosingScene({ phase, step, revealMode, headRef, robotPaused }: SceneProps) {
  const show = phase !== "standby";
  const auto = revealMode === "auto";
  const line2 = show && (auto || step >= 1);
  const line3 = show && (auto || step >= 2);

  return (
    <section
      aria-label="Ask Klara – close"
      className="absolute inset-0 cursor-none overflow-hidden"
      style={{ background: DARK_BG }}
    >
      <Stage>
        <StaticSpotlight visible={show} x={SPOT.x} y={SPOT.y} />

        <div
          className="absolute"
          style={{ left: u(ROBOT_BOX.left), top: u(ROBOT_BOX.top), width: u(ROBOT_BOX.width), height: u(ROBOT_BOX.height) }}
        >
          <KlaraRobot className="size-full" headRef={headRef} paused={robotPaused} />
        </div>

        <ExitBlur
          phase={phase}
          className="absolute top-0 bottom-0 flex flex-col justify-center"
          style={{ left: u(160), width: u(780), paddingBottom: u(40) }}
        >
          <FadeUp
            as="p"
            show={show}
            className="leading-[1.15] tracking-[-0.02em] text-neutral-300"
            style={{ fontSize: u(56) }}
          >
            He didn’t ask for a letter.
          </FadeUp>

          <p
            className="text-balance font-bold leading-[1.02] tracking-[-0.035em]"
            style={{ fontSize: u(88), marginTop: u(24) }}
          >
            <RevealWords
              text="Klara noticed the money."
              show={line2}
              delay={auto ? 1.1 : 0}
              stagger={0.05}
              wordClassName={SILVER_TEXT}
            />
          </p>

          <FadeUp
            as="p"
            show={line3}
            delay={auto ? 2.2 : 0.1}
            duration={0.5}
            className="text-zinc-500"
            style={{ fontSize: u(20), marginTop: u(64) }}
          >
            Ask Klara · Team Build Different
          </FadeUp>
        </ExitBlur>
      </Stage>
    </section>
  );
}
