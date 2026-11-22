// Live demo (/demo): title → "Start live demo" → the app → Besprechungen →
// "Finish demo" → closing slide, all in one tab. Demo mode is a sessionStorage
// flag, so normal use of the app never sees the demo controls.
import { useSyncExternalStore } from "react";
import { IDS } from "@/lib/ids";

/** Where "Start live demo" lands: the Polier's call screen (Estrich, Riem). Change here only. */
export const DEMO_LIVE_START = `/app/call/new?team=${IDS.teamEstrich}`;

/** The closing slide that "Finish demo" leads to. */
export const DEMO_CLOSE = "/demo?scene=close";

const KEY = "klaraDemo";
const listeners = new Set<() => void>();

function write(on: boolean) {
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

export const startDemoMode = () => write(true);
export const clearDemoMode = () => write(false);

/** On, when set by "Start live demo" or forced with ?demo=1 (which also stores it). */
function read(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      sessionStorage.setItem(KEY, "1");
      return true;
    }
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Demo mode for client components; always off during server rendering. */
export function useDemoMode(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
