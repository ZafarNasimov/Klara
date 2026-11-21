"use client";

import dynamic from "next/dynamic";
import { DARK_BG } from "./stage";

// The pitch is a client-only presentation: no server HTML to hydrate, so the
// flow can read ?scene=… on its first render. The dark placeholder matches
// Scene 1, so there is no white flash before it mounts.
const PitchFlow = dynamic(() => import("./PitchFlow").then((m) => m.PitchFlow), {
  ssr: false,
  loading: () => <div className="fixed inset-0" style={{ background: DARK_BG }} />,
});

export function PitchApp() {
  return <PitchFlow />;
}
