"use client";

import type { Application } from "@splinetool/runtime";
import { animate, motion, type AnimationPlaybackControls } from "motion/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  Component,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefCallback,
} from "react";
import { cn } from "@/lib/utils";
import { hasWebGL, loadKlaraScene, SPLINE_WASM_PATH } from "./klara-robot-loader";
import { EASE_IN_OUT, EASE_OUT, u } from "./stage";

const Spline = dynamic(() => import("@splinetool/react-spline"), { ssr: false });

/** Transparent 2× capture of the scene's first frame (head close-up), 2160×2040. */
export const KLARA_ROBOT_PNG = "/pitch/klara-robot.png";

/**
 * Head (visor) position in % of the robot box, tuned for the 1080×1020 design
 * box the scenes use (ROBOT_BOX). The scene keeps a fixed vertical field of
 * view, so y holds for any box; x assumes that aspect ratio.
 * The scene opens on a close-up of the head (that frame is the PNG), then the
 * camera pulls back to the full robot within ~2.5 s.
 */
const HEAD_INTRO = { x: 48, y: 46 };
const HEAD_SETTLED = { x: 50.3, y: 26 };
const INTRO_MS = 2400;

const EDGE_FADE: CSSProperties = {
  maskImage:
    "linear-gradient(to bottom, #000 66%, transparent 92%), linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)",
  maskComposite: "intersect",
};

/** Live → PNG if WebGL is missing, loading fails or takes longer than this. */
const DEFAULT_LOAD_TIMEOUT_MS = 2000;

type Mode = "loading" | "live" | "fallback";

/** What Klara looks at: an element on the page, or straight at the audience. */
export type GazeTarget = Element | "audience";

export type KlaraRobotHandle = {
  /**
   * Turns Klara's head toward a target by gliding a virtual pointer there
   * (the scene's head-follow reacts to pointer moves). The real mouse still
   * takes over as soon as it moves. Called before the robot is live, the
   * glance waits and runs once it is.
   */
  glanceAt: (target: GazeTarget) => void;
};

const GLANCE_MS = 700;

const centerOf = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

function movePointer(x: number, y: number) {
  document.documentElement.dispatchEvent(
    new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true, pointerType: "mouse", isPrimary: true }),
  );
}

export type KlaraRobotProps = {
  className?: string;
  /** Fires once the live robot is on screen (not for the PNG fallback). */
  onLoad?: (app: Application) => void;
  /** 1×1 px element over the robot's visor: origin for the scene transitions. */
  headRef?: RefCallback<HTMLDivElement>;
  /**
   * Stops Spline rendering while the robot is covered (a transition, or a scene
   * waiting underneath). Takes effect once the camera intro has settled, so a
   * robot that loads hidden still arrives in its final pose.
   */
  paused?: boolean;
  loadTimeoutMs?: number;
  namePlate?: boolean;
  /** Imperative handle: `glanceAt(target)`. */
  ref?: Ref<KlaraRobotHandle>;
};

const noopSubscribe = () => () => {};

export function KlaraRobot({
  className,
  onLoad,
  headRef,
  paused = false,
  loadTimeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
  namePlate = true,
  ref,
}: KlaraRobotProps) {
  // Server snapshot assumes WebGL so the first client render matches the HTML.
  const webgl = useSyncExternalStore(noopSubscribe, hasWebGL, () => true);
  const [mode, setMode] = useState<Mode>("loading");
  const [sceneUrl, setSceneUrl] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const appRef = useRef<Application | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const glanceRef = useRef<AnimationPlaybackControls | null>(null);
  const pendingGazeRef = useRef<GazeTarget | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const state: Mode = webgl ? mode : "fallback";
  const live = state === "live";

  // Fetch the scene (usually already preloaded) and give Spline a deadline.
  useEffect(() => {
    if (!webgl) return;
    let cancelled = false;
    loadKlaraScene().then(
      (url) => !cancelled && setSceneUrl(url),
      () => !cancelled && setMode("fallback"),
    );
    const deadline = window.setTimeout(
      () => setMode((m) => (m === "loading" ? "fallback" : m)),
      loadTimeoutMs,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(deadline);
    };
  }, [webgl, loadTimeoutMs]);

  // Spline resolves before its first frame is drawn; crossfade on that frame,
  // otherwise the PNG would fade into an empty canvas.
  const handleLoad = useCallback(
    (app: Application) => {
      appRef.current = app;
      app.setGlobalEvents(true); // head follows the pointer anywhere on the page
      const box = boxRef.current;
      let done = false;
      const goLive = () => {
        if (done) return;
        done = true;
        box?.removeEventListener("rendered", goLive);
        setMode((m) => (m === "loading" ? "live" : m));
        onLoad?.(app);
      };
      box?.addEventListener("rendered", goLive);
      window.setTimeout(goLive, 400);
    },
    [onLoad],
  );

  // The visor travels with the camera intro; the anchor follows once it settles.
  useEffect(() => {
    if (!live) return;
    const timer = window.setTimeout(() => setSettled(true), INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [live]);

  useEffect(() => {
    const app = appRef.current;
    if (!app || !live) return;
    if (paused && settled) app.stop();
    else if (!paused && app.isStopped) app.play();
  }, [paused, live, settled]);

  // Remember where the real pointer is, so a scripted glance starts from it.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!e.isTrusted) return;
      glanceRef.current?.stop(); // the presenter's mouse wins
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      glanceRef.current?.stop();
    };
  }, []);

  const runGlance = useCallback((target: GazeTarget) => {
    const anchor = anchorRef.current;
    const box = boxRef.current;
    if (!anchor || !box) return;
    const head = centerOf(anchor);
    // Straight ahead = the point just below the visor (she faces the room).
    const to =
      target === "audience"
        ? { x: head.x, y: head.y + box.getBoundingClientRect().height * 0.04 }
        : centerOf(target);
    const from = pointerRef.current ?? head;
    glanceRef.current?.stop();
    glanceRef.current = animate(0, 1, {
      duration: GLANCE_MS / 1000,
      ease: EASE_IN_OUT,
      onUpdate: (t) => {
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        pointerRef.current = { x, y };
        movePointer(x, y);
      },
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      glanceAt: (target) => {
        if (live) runGlance(target);
        else pendingGazeRef.current = target;
      },
    }),
    [live, runGlance],
  );

  // A glance asked for while loading runs once the robot is live.
  useEffect(() => {
    if (!live || !pendingGazeRef.current) return;
    const target = pendingGazeRef.current;
    pendingGazeRef.current = null;
    runGlance(target);
  }, [live, runGlance]);

  const setAnchor = useCallback(
    (el: HTMLDivElement | null) => {
      anchorRef.current = el;
      headRef?.(el);
    },
    [headRef],
  );

  const head = live && settled ? HEAD_SETTLED : HEAD_INTRO;

  return (
    <div
      ref={boxRef}
      data-robot-state={state}
      className={cn("relative select-none", className)}
    >
      {/* Legs dissolve into the background (the name plate sits below); the
          side edges fade so a shoulder or hand never meets a hard line. */}
      <div className="absolute inset-0" style={EDGE_FADE}>
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: live ? 0 : 1 }}
          // Ease-in: the image holds while the live robot (drawn above) fades up.
          transition={{ duration: 0.4, ease: [0.55, 0, 1, 0.45] }}
        >
          <Image
            src={KLARA_ROBOT_PNG}
            alt=""
            fill
            unoptimized
            loading="eager"
            fetchPriority="high"
            draggable={false}
            sizes="52vw"
            className="object-cover"
          />
        </motion.div>

        {webgl && sceneUrl && state !== "fallback" && (
          <SplineBoundary onError={() => setMode("fallback")}>
            <motion.div
              className="absolute inset-0 [&_canvas]:cursor-[inherit]!"
              initial={{ opacity: 0 }}
              animate={{ opacity: live ? 1 : 0 }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
            >
              <Spline
                scene={sceneUrl}
                wasmPath={SPLINE_WASM_PATH}
                // The scene ships no HTML overlay we need; never run its scripts.
                htmlContentMode="none"
                onLoad={handleLoad}
                style={{ width: "100%", height: "100%" }}
              />
            </motion.div>
          </SplineBoundary>
        )}
      </div>

      <div
        ref={setAnchor}
        aria-hidden
        data-klara-head
        className="pointer-events-none absolute size-px"
        style={{ left: `${head.x}%`, top: `${head.y}%` }}
      />

      {namePlate && (
        <span
          className="absolute -translate-x-1/2 rounded-full border border-zinc-800 font-mono leading-none tracking-[0.2em] text-zinc-400"
          style={{
            left: `${HEAD_SETTLED.x}%`,
            bottom: u(56),
            // 13 design px; never below 11 px on small laptop screens.
            fontSize: `max(11px, ${u(13)})`,
            // Tracking adds space after the last letter; trim it so the text centres.
            padding: `${u(5)} calc(${u(12)} - 0.2em) ${u(5)} ${u(12)}`,
          }}
        >
          KLARA
        </span>
      )}
    </div>
  );
}

/** Spline throws load errors during render; this turns them into the PNG. */
class SplineBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[pitch] Klara robot shows the image fallback:", error);
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
