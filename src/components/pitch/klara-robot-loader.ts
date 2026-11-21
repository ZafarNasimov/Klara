// Loads the Klara robot (Spline) once per page and shares it between scenes.
//
// The scene file is fetched into memory and handed to Spline as a blob URL, so
// the title and the closing scene both start from RAM and nothing waits on the
// network. The local copy in /public is the source; the Spline CDN is only a
// fallback when the local file is missing.

export const LOCAL_SCENE_URL = "/pitch/klara-robot.splinecode";
export const REMOTE_SCENE_URL = "https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode";

/** The runtime's wasm helpers (bevel, process), served locally for offline use. */
export const SPLINE_WASM_PATH = "/pitch/spline";

let scenePromise: Promise<string> | null = null;
let componentPromise: Promise<unknown> | null = null;
let webglSupport: boolean | null = null;

async function fetchAsObjectUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Spline scene ${url}: HTTP ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

/** Blob URL of the robot scene: local file first, Spline CDN second. */
export function loadKlaraScene(): Promise<string> {
  scenePromise ??= fetchAsObjectUrl(LOCAL_SCENE_URL)
    .catch(() => fetchAsObjectUrl(REMOTE_SCENE_URL))
    .catch((error: unknown) => {
      scenePromise = null; // let a later mount try again
      throw error;
    });
  return scenePromise;
}

/** Warms the code-split Spline chunk (same module next/dynamic loads). */
export function loadSplineComponent(): Promise<unknown> {
  componentPromise ??= import("@splinetool/react-spline").catch((error: unknown) => {
    componentPromise = null;
    throw error;
  });
  return componentPromise;
}

export function hasWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    webglSupport = gl !== null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/** Call when /pitch mounts: starts the scene download and the Spline chunk. */
export function preloadKlaraRobot(): void {
  if (!hasWebGL()) return;
  loadKlaraScene().catch(() => {});
  loadSplineComponent().catch(() => {});
}
