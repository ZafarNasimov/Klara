import type { Metadata } from "next";
import { DemoApp } from "@/components/pitch/DemoApp";

export const metadata: Metadata = { title: "Live demo" };

/** Live demo: title → "Start live demo" → the app → "Finish demo" → close, in one tab. */
export default function DemoPage() {
  return <DemoApp />;
}
