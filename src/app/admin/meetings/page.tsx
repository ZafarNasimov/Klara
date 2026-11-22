import type { Metadata } from "next";
import { FinishDemo } from "@/components/demo/finish-demo";
import { MeetingsList } from "@/components/meetings/meetings-list";

export const metadata: Metadata = { title: "Besprechungen" };

/** Project meetings: record → transcript → protocol, tasks and evidenced drafts. */
export default function MeetingsPage() {
  return (
    <>
      <MeetingsList />
      {/* Live demo only (/demo): leads to the closing slide. */}
      <FinishDemo />
    </>
  );
}
