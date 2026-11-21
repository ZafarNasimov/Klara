import { AdminScene, OFFICE_BEATS } from "./scenes/AdminScene";
import { CallScene } from "./scenes/CallScene";
import { ClosingScene } from "./scenes/ClosingScene";
import { EcosystemScene } from "./scenes/EcosystemScene";
import { PortfolioScene } from "./scenes/PortfolioScene";
import type { PitchSceneDef } from "./scenes/scene-parts";
import { SourcesScene } from "./scenes/SourcesScene";
import { TitleScene, TITLE_STATS } from "./scenes/TitleScene";
import { CALL_EXCHANGES } from "./pitch-story";

/**
 * The pitch, in order (content spec 2026-11-21). `steps` = clicks a scene
 * consumes before the next click changes scene. Number keys 1–6 jump to a
 * scene; 6a → 6b is the light→dark collapse into the close.
 */
export const PITCH_SCENES: PitchSceneDef[] = [
  { id: "title", key: "1", label: "Ask Klara", theme: "dark", steps: TITLE_STATS.length, Component: TitleScene },
  // 4 exchanges + "after the call"
  { id: "call", key: "2", label: "The call", theme: "light", steps: CALL_EXCHANGES + 1, Component: CallScene },
  // open case, transcript, close, clarify, recipient, sent (3.2), replied (3.3, also "S"), validated (3.4)
  { id: "office", key: "3", label: "The office", theme: "light", steps: 8, pointer: true, keyBeats: { s: OFFICE_BEATS.sent }, Component: AdminScene },
  { id: "sources", key: "4", label: "More sources", theme: "light", steps: 3, Component: SourcesScene },
  { id: "portfolio", key: "5", label: "Every site at a glance", theme: "light", steps: 1, Component: PortfolioScene },
  // strike-through, line 2, inputs, outputs, people
  { id: "ecosystem", key: "6a", label: "An operating system", theme: "light", steps: 5, Component: EcosystemScene },
  { id: "close", key: "6b", label: "No lost money", theme: "dark", steps: 4, Component: ClosingScene },
];
