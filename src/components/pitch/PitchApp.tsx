"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { DARK_BG } from "./stage";

// The pitch is a client-only presentation: no server HTML to hydrate, so the
// flow can read ?scene=… on its first render. The dark placeholder matches
// Scene 1, so there is no white flash before it mounts.
const PitchFlow = dynamic(() => import("./PitchFlow").then((m) => m.PitchFlow), {
  ssr: false,
  loading: () => <PitchPlaceholder />,
});

/** Dark like Scene 1 and the close, while the flow loads. */
export function PitchPlaceholder() {
  return <div className="fixed inset-0" style={{ background: DARK_BG }} />;
}

export function PitchApp() {
  // Links into the pitch ("Demo beenden" → ?scene=6b) are client-side navigations:
  // read ?scene= from the router; the window URL may still be the previous page's.
  const params = useSearchParams();
  // A new ?go= token ("Demo beenden") starts the flow afresh, also when Next
  // kept this page alive from earlier in the tab.
  return <PitchFlow key={params.get("go") ?? ""} initialSearch={params.toString()} />;
}
