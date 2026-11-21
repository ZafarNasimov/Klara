import type { Metadata } from "next";
import { Suspense } from "react";
import { MeetingScreen } from "@/components/meetings/meeting-screen";

export const metadata: Metadata = { title: "Besprechung" };

export default async function MeetingPage({ params }: PageProps<"/admin/meetings/[id]">) {
  const { id } = await params;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Suspense>
        <MeetingScreen id={id} />
      </Suspense>
    </div>
  );
}
