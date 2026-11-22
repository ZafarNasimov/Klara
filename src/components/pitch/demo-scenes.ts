import { PITCH_SCENES } from "./pitch-scenes";
import type { PitchSceneDef } from "./scenes/scene-parts";
import { StartDemoScene } from "./scenes/StartDemoScene";

const pitch = (id: string) => PITCH_SCENES.find((s) => s.id === id)!;

/**
 * /demo, the live demo: the pitch's title and close around the real app.
 * Keys 1–3 jump; ?scene=title|start|close. The title and close are the
 * /pitch scenes themselves (same component, same beats).
 */
export const DEMO_SCENES: PitchSceneDef[] = [
  { ...pitch("title"), key: "1", slug: "title" },
  // One button into the app; Space does nothing here.
  { id: "start", key: "2", slug: "start", label: "Start live demo", theme: "light", steps: 0, pointer: true, holdNext: true, Component: StartDemoScene },
  // Arrives from the app ("Finish demo"); nothing before it to go back to.
  { ...pitch("close"), key: "3", slug: "close", holdBackAtStart: true },
];
