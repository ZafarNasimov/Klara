"use client";
// Hackathon "auth": a role switcher in the header (SPEC §2). The role lives in
// localStorage; each role maps to a fixed seed user.
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { IDS } from "@/lib/ids";

export type UiRole = "polier" | "bauleiter" | "buero";

export const ROLES: { id: UiRole; label: string; home: string; userId: string; userName: string }[] = [
  { id: "polier", label: "Polier", home: "/app", userId: IDS.userPolierEstrich, userName: "Sergej Iwanow" },
  { id: "bauleiter", label: "Bauleiter", home: "/admin", userId: IDS.userBauleiter, userName: "Markus Hofmann" },
  { id: "buero", label: "Büro", home: "/admin", userId: IDS.userBuero, userName: "Julia Brenner" },
];

const KEY = "klara_role";
const listeners = new Set<() => void>();

function read(): UiRole | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "polier" || v === "bauleiter" || v === "buero" ? v : null;
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

type RoleCtx = {
  /** Stored role, or the default for the current surface. */
  role: UiRole;
  setRole: (r: UiRole) => void;
  userId: string;
  userName: string;
};

const Ctx = createContext<RoleCtx | null>(null);

/** Stores the role (also outside a RoleProvider, e.g. the live demo's start button). */
export function storeRole(r: UiRole) {
  try {
    localStorage.setItem(KEY, r);
  } catch {}
  listeners.forEach((l) => l());
}

export function RoleProvider({ children, fallback = "bauleiter" }: { children: ReactNode; fallback?: UiRole }) {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const setRole = useCallback((r: UiRole) => storeRole(r), []);
  const value = useMemo(() => {
    const role = stored ?? fallback;
    const def = ROLES.find((r) => r.id === role)!;
    return { role, setRole, userId: def.userId, userName: def.userName };
  }, [stored, fallback, setRole]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRole(): RoleCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRole outside RoleProvider");
  return v;
}
