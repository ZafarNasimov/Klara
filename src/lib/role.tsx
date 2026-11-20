"use client";
// Hackathon role switcher (SPEC §2: no real auth).
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { IDS } from "@/lib/db/seed";

export type Role = "polier" | "bauleiter" | "buero";

export const ROLES: { id: Role; label: string; userId: string; home: string }[] = [
  { id: "polier", label: "Polier", userId: IDS.userPolierEstrich, home: "/app" },
  { id: "bauleiter", label: "Bauleiter", userId: IDS.userBauleiter, home: "/admin" },
  { id: "buero", label: "Büro", userId: IDS.userBuero, home: "/admin" },
];

const Ctx = createContext<{ role: Role; setRole: (r: Role) => void; userId: string }>({
  role: "bauleiter",
  setRole: () => {},
  userId: IDS.userBauleiter,
});

export function RoleProvider({ children, initial = "bauleiter" }: { children: ReactNode; initial?: Role }) {
  const [role, setRoleState] = useState<Role>(initial);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("klara_role") as Role | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore saved role after hydration
      if (saved && ROLES.some((r) => r.id === saved)) setRoleState(saved);
    } catch {}
  }, []);
  const setRole = (r: Role) => {
    setRoleState(r);
    try {
      localStorage.setItem("klara_role", r);
    } catch {}
  };
  const userId = ROLES.find((r) => r.id === role)!.userId;
  return <Ctx.Provider value={{ role, setRole, userId }}>{children}</Ctx.Provider>;
}

export const useRole = () => useContext(Ctx);
