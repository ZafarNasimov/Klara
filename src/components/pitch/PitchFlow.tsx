"use client";

import { animate, MotionConfig, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { preloadKlaraRobot } from "./klara-robot-loader";
import { PITCH_SCENES } from "./pitch-scenes";
import type { PitchSceneDef, RevealMode, SceneController } from "./scenes/scene-parts";
import { DARK_BG, EASE_IN_OUT, EASE_OUT, LIGHT_BG, PITCH_UNIT, type ScenePhase, u } from "./stage";

/**
 * reveal:   dark → light, a light circle grows from Klara's head
 * collapse: light → dark, the light shrinks back into Klara's head
 * fade:     dark ↔ light fallback, background crossfade with content fade-through
 * swap:     same theme, content fade-through
 */
type Kind = "reveal" | "collapse" | "fade" | "swap";
type Transition = { id: number; from: number; to: number; kind: Kind };

/** Timeline in ms (see the choreography notes in the PR / PROGRESS.md). */
const T = {
  glow: 300, // visor glow 0 → 0.8 → 0
  // On the reveal the glow stays up until the disc is wider than the head
  // (~220 px at 450 ms), so its hard clip edge never shows on the face.
  revealGlow: 450,
  wipeStart: 150, // circle starts at the glow's peak
  wipe: 1100, // clip-path circle, ease (0.65, 0, 0.35, 1), radius = farthest corner
  revealContentAt: 0.6, // light scene content enters once the circle passes ~60 %
  collapseContentAt: 0.35, // dark scene text enters as the light uncovers the text column
  fade: 900, // fallback background crossfade
  swapDelay: 150,
  swap: 300,
};

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"]);
const BACK_KEYS = new Set(["ArrowLeft", "ArrowUp", "PageUp", "Backspace"]);

type Options = { start: number; fadeOnly: boolean; reveal: RevealMode; autoPace: boolean; debug: boolean };

/** Scene for a key like "3" or "6b" (a bare digit picks the first scene starting with it). */
function sceneIndex(scenes: PitchSceneDef[], key: string | null): number {
  if (!key) return -1;
  const exact = scenes.findIndex((s) => s.key === key);
  return exact >= 0 ? exact : scenes.findIndex((s) => s.key.startsWith(key));
}

/** Rehearsal switches: ?scene=6b, ?transition=fade, ?reveal=auto, ?pace=auto, ?debug=1 */
function readOptions(scenes: PitchSceneDef[]): Options {
  const params = new URLSearchParams(window.location.search);
  return {
    start: Math.max(0, sceneIndex(scenes, params.get("scene"))),
    fadeOnly: params.get("transition") === "fade",
    reveal: params.get("reveal") === "auto" ? "auto" : "click",
    autoPace: params.get("pace") === "auto" || params.get("reveal") === "auto",
    debug: params.get("debug") === "1",
  };
}

/** Circle radius that just covers the window from (x, y): the farthest corner. */
function coverRadius(x: number, y: number) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return Math.ceil(Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y))) + 2;
}

function centerOf(el: Element | undefined) {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Client-only (mounted via PitchApp with ssr: false): reads the URL on first render. */
export function PitchFlow({ scenes = PITCH_SCENES }: { scenes?: PitchSceneDef[] }) {
  const [options] = useState(() => readOptions(scenes));
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(options.start);
  const [steps, setSteps] = useState<number[]>(() => scenes.map(() => 0));
  const [tx, setTx] = useState<Transition | null>(null);
  const [incomingPhase, setIncomingPhase] = useState<ScenePhase>("standby");
  // "A": AUTO pacing for self-paced scenes (Scene 2), for rehearsals and video.
  const [autoPace, setAutoPace] = useState(options.autoPace);
  // "R" remounts the current scene, so every bit of its state starts over.
  const [resetTokens, setResetTokens] = useState<number[]>(() => scenes.map(() => 0));
  // Scenes entered by going back show their end state.
  const [arrivedBack, setArrivedBack] = useState<boolean[]>(() => scenes.map(() => false));
  const controllers = useRef(new Map<number, SceneController>());

  const layerEls = useRef(new Map<number, HTMLDivElement>());
  const headEls = useRef(new Map<number, HTMLDivElement>());
  const glowRef = useRef<HTMLDivElement>(null);

  // Stable callback refs per scene, so layers never re-attach on re-render.
  const layerRefs = useMemo(
    () =>
      scenes.map((_, i) => (el: HTMLDivElement | null) => {
        if (el) layerEls.current.set(i, el);
        else layerEls.current.delete(i);
      }),
    [scenes],
  );
  const controllerRegistrars = useMemo(
    () =>
      scenes.map((_, i) => (controller: SceneController | null) => {
        if (controller) controllers.current.set(i, controller);
        else controllers.current.delete(i);
      }),
    [scenes],
  );
  const headRefs = useMemo(
    () =>
      scenes.map((_, i) => (el: HTMLDivElement | null) => {
        if (el) headEls.current.set(i, el);
        else headEls.current.delete(i);
      }),
    [scenes],
  );

  // Keep the scene in the URL so a reload (or a clicker's F5) stays on it.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("scene", scenes[index].key);
    window.history.replaceState(window.history.state, "", url);
  }, [index, scenes]);

  // Start the robot download the moment /pitch mounts.
  useEffect(() => {
    preloadKlaraRobot();
  }, []);

  const go = useCallback(
    (to: number) => {
      if (tx || to < 0 || to >= scenes.length || to === index) return;
      const from = index;
      const a = scenes[from].theme;
      const b = scenes[to].theme;
      const plain = options.fadeOnly || reducedMotion === true;
      const kind: Kind = a === b ? "swap" : plain ? "fade" : a === "dark" ? "reveal" : "collapse";
      // Forward starts a scene from scratch; going back shows it fully revealed.
      setSteps((s) => s.map((v, i) => (i === to ? (to > from ? 0 : scenes[to].steps) : v)));
      setArrivedBack((a) => a.map((v, i) => (i === to ? to < from : v)));
      setIncomingPhase("standby");
      setTx({ id: Date.now(), from, to, kind });
    },
    [tx, index, scenes, options.fadeOnly, reducedMotion],
  );

  const advance = useCallback(() => {
    if (tx) return;
    // A self-paced scene takes the press first (e.g. queues the next turn).
    if (controllers.current.get(index)?.onNext?.()) return;
    const maxStep = options.reveal === "click" ? scenes[index].steps : 0;
    if (steps[index] < maxStep) {
      setSteps((s) => s.map((v, i) => (i === index ? v + 1 : v)));
      return;
    }
    go(index + 1);
  }, [tx, options.reveal, scenes, index, steps, go]);

  // Back undoes one beat inside a scene first (an accidental double click in
  // Scene 3 is one key away), then goes to the previous scene, fully revealed.
  const back = useCallback(() => {
    if (tx) return;
    if (controllers.current.get(index)?.onBack?.()) return;
    if (options.reveal === "click" && steps[index] > 0) {
      setSteps((s) => s.map((v, i) => (i === index ? v - 1 : v)));
      return;
    }
    go(index - 1);
  }, [tx, options.reveal, steps, index, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const keyBeat = scenes[index].keyBeats?.[key];
      if (key === "r") {
        // Reset the current scene to its first beat (REPLAY rehearsal).
        e.preventDefault();
        if (!tx) {
          setSteps((s) => s.map((v, i) => (i === index ? 0 : v)));
          setArrivedBack((a) => a.map((v, i) => (i === index ? false : v)));
          setResetTokens((t) => t.map((v, i) => (i === index ? v + 1 : v)));
        }
      } else if (key === "a") {
        e.preventDefault();
        if (!e.repeat) setAutoPace((on) => !on);
      } else if (keyBeat !== undefined) {
        e.preventDefault();
        if (!e.repeat && steps[index] === keyBeat) advance();
      } else if (/^[1-9]$/.test(e.key)) {
        const target = sceneIndex(scenes, e.key);
        if (target >= 0) {
          e.preventDefault();
          if (!e.repeat) go(target);
        }
      } else if (NEXT_KEYS.has(e.key)) {
        e.preventDefault();
        if (!e.repeat) advance();
      } else if (BACK_KEYS.has(e.key)) {
        e.preventDefault();
        if (!e.repeat) back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, back, go, scenes, index, steps, tx]);

  // Run one transition. Input is ignored until it finishes (no double skips).
  useEffect(() => {
    if (!tx) return;
    const fromEl = layerEls.current.get(tx.from);
    const toEl = layerEls.current.get(tx.to);
    const glow = glowRef.current;
    if (!fromEl || !toEl) return;

    const sec = (ms: number) => ms / 1000;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const running: { stop: () => void; finished: Promise<unknown> }[] = [];

    if (tx.kind === "reveal" || tx.kind === "collapse") {
      const head = headEls.current.get(tx.kind === "reveal" ? tx.from : tx.to);
      const { x, y } = centerOf(head);
      const far = `${coverRadius(x, y)}px`;
      const circle = (r: string) => `circle(${r} at ${x}px ${y}px)`;
      if (glow) {
        glow.style.left = `${x}px`;
        glow.style.top = `${y}px`;
      }
      if (tx.kind === "reveal") {
        // Glow peaks as the light starts, so the light comes out of Klara.
        if (glow) running.push(animate(glow, { opacity: [0, 0.8, 0] }, { duration: sec(T.revealGlow), times: [0, T.wipeStart / T.revealGlow, 1], ease: "easeInOut" }));
        running.push(
          animate(toEl, { clipPath: [circle("0px"), circle(far)] }, { duration: sec(T.wipe), delay: sec(T.wipeStart), ease: EASE_IN_OUT }),
        );
        at(T.wipeStart + T.wipe * T.revealContentAt, () => setIncomingPhase("enter"));
      } else {
        running.push(
          animate(fromEl, { clipPath: [circle(far), circle("0px")] }, { duration: sec(T.wipe), delay: sec(T.wipeStart), ease: EASE_IN_OUT }),
        );
        // Mirror of the reveal: the visor glows as the last light disappears into it.
        if (glow) running.push(animate(glow, { opacity: [0, 0.8, 0] }, { duration: sec(T.glow), delay: sec(T.wipeStart + T.wipe - T.glow / 2), times: [0, 0.5, 1], ease: "easeInOut" }));
        at(T.wipeStart + T.wipe * T.collapseContentAt, () => setIncomingPhase("enter"));
      }
    } else if (tx.kind === "fade") {
      running.push(animate(toEl, { opacity: [0, 1] }, { duration: sec(T.fade), ease: "easeInOut" }));
      at(T.fade * 0.65, () => setIncomingPhase("enter"));
    } else {
      running.push(animate(toEl, { opacity: [0, 1] }, { duration: sec(T.swap), delay: sec(T.swapDelay), ease: EASE_OUT }));
      at(T.swapDelay, () => setIncomingPhase("enter"));
    }

    let cancelled = false;
    Promise.all(running.map((r) => r.finished)).then(() => {
      if (cancelled) return;
      setIndex(tx.to);
      setTx(null);
    }, () => {});
    return () => {
      cancelled = true;
      running.forEach((r) => r.stop());
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [tx]);

  // Which scenes are mounted, with phase and stacking. DOM order stays by scene
  // index so a layer (and its WebGL canvas) is never moved or remounted.
  const layers: { i: number; phase: ScenePhase; z: number; style?: CSSProperties }[] = [];
  if (tx) {
    const fromPhase: ScenePhase = "exit";
    switch (tx.kind) {
      case "reveal":
        layers.push({ i: tx.from, phase: fromPhase, z: 1 });
        layers.push({ i: tx.to, phase: incomingPhase, z: 3, style: { clipPath: "circle(0px at 50% 50%)" } });
        break;
      case "collapse":
        layers.push({ i: tx.to, phase: incomingPhase, z: 1 });
        layers.push({ i: tx.from, phase: fromPhase, z: 3, style: { clipPath: "circle(150% at 50% 50%)" } });
        break;
      default:
        layers.push({ i: tx.from, phase: fromPhase, z: 1 });
        layers.push({ i: tx.to, phase: incomingPhase, z: 3, style: { opacity: 0 } });
    }
  } else {
    layers.push({ i: index, phase: "enter", z: 1 });
    // Mount the next dark scene early, hidden underneath, so its robot is loaded
    // and settled before the light→dark wipe (no WebGL start-up during the wipe).
    const next = scenes[index + 1];
    if (next && next.theme === "dark" && scenes[index].theme === "light") {
      layers.push({ i: index + 1, phase: "standby", z: 0 });
    }
  }
  layers.sort((a, b) => a.i - b.i);

  const current = scenes[tx ? tx.to : index];

  return (
    <MotionConfig reducedMotion="user">
      <div
        lang="en"
        className={cn("fixed inset-0 overflow-hidden select-none", !current.pointer && "cursor-none")}
        style={{ "--pitch-u": PITCH_UNIT, background: current.theme === "dark" ? DARK_BG : LIGHT_BG } as CSSProperties}
        onClick={(e) => {
          if (e.button !== 0) return;
          // In click-into scenes only the marked next control advances.
          if (current.pointer && !(e.target as Element).closest("[data-next]")) return;
          advance();
        }}
      >
        {layers.map(({ i, phase, z, style }) => {
          const { Component } = scenes[i];
          return (
            <div
              key={scenes[i].id}
              ref={layerRefs[i]}
              className="absolute inset-0"
              style={{ zIndex: z, ...style }}
              // A scene waiting underneath must not be read out (it would
              // spoil the punchline) or take focus.
              inert={phase === "standby"}
              aria-hidden={phase === "standby" || undefined}
            >
              <Component
                key={resetTokens[i]}
                phase={phase}
                step={steps[i]}
                revealMode={options.reveal}
                autoPace={autoPace}
                debug={options.debug}
                arrivedBack={arrivedBack[i]}
                registerController={controllerRegistrars[i]}
                headRef={headRefs[i]}
                // Covered robots stop rendering (a waiting one after its intro).
                robotPaused={phase !== "enter"}
              />
            </div>
          );
        })}

        {tx && (tx.kind === "reveal" || tx.kind === "collapse") && (
          <div
            ref={glowRef}
            aria-hidden
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              zIndex: 4,
              width: u(380),
              height: u(380),
              opacity: 0,
              background:
                "radial-gradient(circle, rgb(255 255 255 / 0.95) 0%, rgb(255 255 255 / 0.35) 38%, transparent 70%)",
            }}
          />
        )}

        <p className="sr-only" aria-live="polite">
          {`${current.label}, scene ${current.key}`}
        </p>
      </div>
    </MotionConfig>
  );
}
