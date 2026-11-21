import type { Metadata } from "next";
import { Suspense } from "react";
import { MeetingScreen } from "@/components/meetings/meeting-screen";

export const metadata: Metadata = { title: "Besprechung" };

/** One meeting: recording → processing → protocol (params read inside Suspense, Cache Components). */
export default function MeetingPage({ params }: PageProps<"/admin/meetings/[id]">) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Suspense>
        <Meeting params={params} />
      </Suspense>
    </div>
  );
}

async function Meeting({ params }: { params: PageProps<"/admin/meetings/[id]">["params"] }) {
  const { id } = await params;
  return <MeetingScreen id={id} />;
}
