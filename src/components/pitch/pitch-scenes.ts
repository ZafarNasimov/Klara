import { ClosingScene } from "./scenes/ClosingScene";
import type { PitchSceneDef } from "./scenes/scene-parts";
import { makeStandInScene } from "./scenes/StandInScene";
import { TitleScene, TITLE_POINTS } from "./scenes/TitleScene";

/**
 * The pitch, in order. Scenes 2–5 are stand-ins: swap each `Component` for the
 * real light scene (it receives `phase`; wrap its content in <SceneContent>).
 */
export const PITCH_SCENES: PitchSceneDef[] = [
  { id: "title", label: "Ask Klara", theme: "dark", steps: TITLE_POINTS.length, Component: TitleScene },
  { id: "scene-2", label: "Scene 2", theme: "light", steps: 0, Component: makeStandInScene(2) },
  { id: "scene-3", label: "Scene 3", theme: "light", steps: 0, Component: makeStandInScene(3) },
  { id: "scene-4", label: "Scene 4", theme: "light", steps: 0, Component: makeStandInScene(4) },
  { id: "scene-5", label: "Scene 5", theme: "light", steps: 0, Component: makeStandInScene(5) },
  { id: "close", label: "Klara noticed the money", theme: "dark", steps: 2, Component: ClosingScene },
];
