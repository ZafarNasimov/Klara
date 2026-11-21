"use client";

import { LIGHT_BG, u } from "../stage";
import { SceneContent, Stage, type SceneProps } from "./scene-parts";

/**
 * Light stand-in for Scenes 2–5 until their real specs are built. It only
 * exists so the dark↔light transitions can be rehearsed end to end.
 */
export function makeStandInScene(sceneNumber: number) {
  function StandInScene({ phase }: SceneProps) {
    return (
      <section
        aria-label={`Scene ${sceneNumber} (stand-in)`}
        className="absolute inset-0 overflow-hidden"
        style={{ background: LIGHT_BG }}
      >
        <Stage>
          <SceneContent
            phase={phase}
            className="absolute flex flex-col"
            style={{ left: u(160), top: u(140), gap: u(16) }}
          >
            <span className="font-mono text-zinc-400" style={{ fontSize: u(16) }}>
              Scene {sceneNumber} / 6
            </span>
            <span className="font-medium tracking-[-0.02em] text-zinc-900" style={{ fontSize: u(40) }}>
              Stand-in for the light scene
            </span>
            <span className="text-zinc-500" style={{ fontSize: u(20) }}>
              Replace with the real Scene {sceneNumber} component in pitch-scenes.ts.
            </span>
          </SceneContent>
        </Stage>
      </section>
    );
  }
  StandInScene.displayName = `StandInScene${sceneNumber}`;
  return StandInScene;
}
