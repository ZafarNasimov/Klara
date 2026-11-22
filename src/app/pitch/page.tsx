import type { Metadata } from "next";
import { Suspense } from "react";
import { PitchApp, PitchPlaceholder } from "@/components/pitch/PitchApp";

export const metadata: Metadata = { title: "Pitch" };

export default function PitchPage() {
  return (
    <Suspense fallback={<PitchPlaceholder />}>
      <PitchApp />
    </Suspense>
  );
}
