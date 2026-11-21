"use client";

import type { Application } from "@splinetool/runtime";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from "react";
import { cn } from "@/lib/utils";
import { hasWebGL, loadKlaraScene, SPLINE_WASM_PATH } from "./klara-robot-loader";
import { EASE_OUT, u } from "./stage";

const Spline = dynamic(() => import("@splinetool/react-spline"), { ssr: false });

/** Transparent capture of the scene's first frame (the head close-up). */
export const KLARA_ROBOT_PNG = "/pitch/klara-robot.png";

/**
 * Head (visor) position in % of the robot box, tuned for a 1000×1080 design box.
 * The scene opens on a close-up of the head (that frame is the PNG), then the
 * camera pulls back to the full robot within ~2.5 s.
 */
const HEAD_INTRO = { x: 48, y: 45 };
const HEAD_SETTLED = { x: 49.3, y: 25 };
const INTRO_MS = 2400;

/** Live → PNG if WebGL is missing, loading fails or takes longer than this. */
const DEFAULT_LOAD_TIMEOUT_MS = 2000;

type Mode = "loading" | "live" | "fallback";

export type KlaraRobotProps = {
  className?: string;
  /** Fires once the live robot is on screen (not for the PNG fallback). */
  onLoad?: (app: Application) => void;
  /** 1×1 px element over the robot's visor: origin for the scene transitions. */
  headRef?: Ref<HTMLDivElement>;
  /** Stops Spline rendering, e.g. while a transition covers the robot. */
  paused?: boolean;
  loadTimeoutMs?: number;
  namePlate?: boolean;
};

const noopSubscribe = () => () => {};

export function KlaraRobot({
  className,
  onLoad,
  headRef,
  paused = false,
  loadTimeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
  namePlate = true,
}: KlaraRobotProps) {
  // Server snapshot assumes WebGL so the first client render matches the HTML.
  const webgl = useSyncExternalStore(noopSubscribe, hasWebGL, () => true);
  const [mode, setMode] = useState<Mode>("loading");
  const [sceneUrl, setSceneUrl] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const appRef = useRef<Application | null>(null);
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
    if (paused) app.stop();
    else if (app.isStopped) app.play();
  }, [paused, live]);

  const head = live && settled ? HEAD_SETTLED : HEAD_INTRO;

  return (
    <div
      ref={boxRef}
      data-robot-state={state}
      className={cn("relative select-none", className)}
    >
      {/* Legs dissolve into the background; the name plate sits below. */}
      <div className="absolute inset-0 mask-[linear-gradient(to_bottom,#000_66%,transparent_92%)]">
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
        ref={headRef}
        aria-hidden
        data-klara-head
        className="pointer-events-none absolute size-px"
        style={{ left: `${head.x}%`, top: `${head.y}%` }}
      />

      {namePlate && (
        <span
          className="absolute -translate-x-1/2 rounded-full border border-zinc-800 font-mono leading-none tracking-[0.2em] text-zinc-500"
          style={{
            left: `${HEAD_SETTLED.x}%`,
            bottom: u(56),
            fontSize: u(13),
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
