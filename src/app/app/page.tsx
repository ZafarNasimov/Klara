import type { Metadata } from "next";
import { MobileHeader } from "@/components/mobile/mobile-header";
import { ProjectChannels } from "./project-channels";

export const metadata: Metadata = { title: "Baustellen" };

export default function MobileHome() {
  return (
    <>
      <MobileHeader title="Baustellen" subtitle="Muster Bau GmbH" />
      <ProjectChannels />
    </>
  );
}
