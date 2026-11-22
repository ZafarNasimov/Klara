"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { clearDemoMode } from "@/lib/demo";
import { DEMO_SCENES } from "./demo-scenes";
import { DARK_BG } from "./stage";

// Client-only like /pitch: the flow reads ?scene=… on its first render, and the
// dark placeholder matches the title and the close (no white flash).
const PitchFlow = dynamic(() => import("./PitchFlow").then((m) => m.PitchFlow), {
  ssr: false,
  loading: () => <DemoPlaceholder />,
});

/** Dark like the slides, while the flow loads. */
export function DemoPlaceholder() {
  return <div className="fixed inset-0" style={{ background: DARK_BG }} />;
}

export function DemoApp() {
  // "Finish demo" arrives by a client-side navigation: read ?scene= from the router, not the window.
  const search = useSearchParams().toString();
  // Reaching the close ends demo mode ("Finish demo" disappears from the app).
  const onSceneEnter = useCallback((id: string) => {
    if (id === "close") clearDemoMode();
  }, []);
  return <PitchFlow scenes={DEMO_SCENES} stepInUrl resetToStart fullscreenKey idleCursor onSceneEnter={onSceneEnter} initialSearch={search} />;
}
