// Shared geometry and timing for the /pitch scenes.
//
// Every scene is laid out on a 1920×1080 design grid. `u(px)` turns a design
// pixel into a real length via `--pitch-u` (set on the pitch root), so the
// layout scales with the window without a CSS transform. That keeps the Spline
// canvas crisp and its pointer mapping exact.

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export const DARK_BG = "#0A0A0A";
export const LIGHT_BG = "#FAFAFA";

/** Design pixels → CSS length that scales with the window. */
export const u = (px: number) => `calc(var(--pitch-u, 1px) * ${px})`;

/** Value for `--pitch-u`: the largest 16:9 box that fits the window. */
export const PITCH_UNIT = `min(calc(100vw / ${STAGE_W}), calc(100vh / ${STAGE_H}))`;

/** Entrances and fades. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
/** The circle wipe between dark and light scenes. */
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export type SceneTheme = "dark" | "light";

/**
 * standby: mounted but not shown yet (content in its hidden start state)
 * enter:   entrance plays / scene is live
 * exit:    content fades out while the transition takes over
 */
export type ScenePhase = "standby" | "enter" | "exit";
