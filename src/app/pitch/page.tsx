import type { Metadata } from "next";
import { PitchApp } from "@/components/pitch/PitchApp";

export const metadata: Metadata = { title: "Pitch" };

export default function PitchPage() {
  return <PitchApp />;
}
