"use client";
// The construction site the office is looking at (board, top bar). Per browser,
// shared by all components of the tab; a case page switches it to its own site.
import { useCallback, useSyncExternalStore } from "react";
import { IDS } from "@/lib/ids";

const KEY = "klara_project";
const EVENT = "klara-project";

function read(): string {
  try {
    return localStorage.getItem(KEY) || IDS.project;
  } catch {
    return IDS.project;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useProjectId(): [string, (id: string) => void] {
  const id = useSyncExternalStore(subscribe, read, () => IDS.project);
  const set = useCallback((next: string) => {
    try {
      if (localStorage.getItem(KEY) === next) return;
      localStorage.setItem(KEY, next);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [id, set];
}
