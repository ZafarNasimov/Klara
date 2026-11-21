"use client";

import { useEffect, useRef } from "react";
import { KlaraRobot, type KlaraRobotHandle } from "../KlaraRobot";
import { StaticSpotlight } from "../StaticSpotlight";
import { DARK_BG, u } from "../stage";
import { ExitBlur, FadeUp, RevealWords, scheduleGlances, SILVER_TEXT, Stage, type SceneProps } from "./scene-parts";
import { ROBOT_BOX } from "./TitleScene";

const SPOT = { x: 77, y: 30 };

/**
 * Scene 6b – close. Same Klara and light as the title; the text arrives line
 * by line: "No missing reports." comes with the scene, then one press plays
 * the rest on a timer, in order, up to the sign-off. In auto mode the whole
 * sequence runs without a press.
 *
 * The robot is never faded in here: the light→dark wipe collapses onto it,
 * so it must already stand there when the wipe starts.
 */
export function ClosingScene({ phase, step, revealMode, headRef, robotPaused }: SceneProps) {
  const show = phase !== "standby";
  const auto = revealMode === "auto";
  // One press (step 1) plays every following line; `play` offsets the delays to that press.
  const play = auto || step >= 1;
  const at = (n: number) => show && (n === 0 || play);
  /** Seconds after the press (or, in auto mode, after the scene enters). */
  const d = (pressed: number, autoAt: number) => (auto ? autoAt : pressed);
  const rootRef = useRef<HTMLElement>(null);
  const robotRef = useRef<KlaraRobotHandle>(null);

  // She reads the two "No …" lines, then turns to the room for the money line.
  useEffect(() => {
    if (phase !== "enter") return;
    const cues: [string, number][] = auto
      ? [["line-1", 300], ["line-2", 1000], ["audience", 1900]]
      : step === 0
        ? [["line-1", 300]]
        : [["line-2", 150], ["audience", 1050]];
    return scheduleGlances(rootRef.current, robotRef.current, cues);
  }, [phase, step, auto]);

  return (
    <section
      ref={rootRef}
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
          <KlaraRobot ref={robotRef} className="size-full" headRef={headRef} paused={robotPaused} />
        </div>

        <ExitBlur
          phase={phase}
          className="absolute top-0 bottom-0 flex flex-col justify-center"
          style={{ left: u(160), width: u(780), paddingBottom: u(40) }}
        >
          <FadeUp
            as="p"
            gaze="line-1"
            show={at(0)}
            className="leading-[1.15] tracking-[-0.02em] text-neutral-300"
            style={{ fontSize: u(56) }}
          >
            No missing reports.
          </FadeUp>

          <FadeUp
            as="p"
            gaze="line-2"
            show={at(1)}
            delay={d(0, 0.9)}
            className="leading-[1.15] tracking-[-0.02em] text-neutral-300"
            style={{ fontSize: u(56), marginTop: u(12) }}
          >
            No missed notices.
          </FadeUp>

          <p className="font-bold leading-[1.02] tracking-[-0.035em]" style={{ fontSize: u(88), marginTop: u(20) }}>
            <RevealWords text="No lost money." show={at(2)} delay={d(0.9, 1.8)} stagger={0.06} wordClassName={SILVER_TEXT} />
          </p>

          <FadeUp
            as="p"
            show={at(3)}
            delay={d(2.0, 2.9)}
            className="tracking-[-0.02em] text-neutral-300"
            style={{ fontSize: u(36), marginTop: u(40), lineHeight: 1.2 }}
          >
            The operating system for construction companies.
          </FadeUp>

          <FadeUp
            as="p"
            show={at(4)}
            delay={d(2.9, 3.8)}
            duration={0.5}
            className="text-zinc-400"
            style={{ fontSize: u(20), marginTop: u(56) }}
          >
            Ask Klara · Team Build Different
          </FadeUp>
        </ExitBlur>
      </Stage>
    </section>
  );
}
