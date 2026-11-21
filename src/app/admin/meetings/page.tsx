import type { Metadata } from "next";
import { MeetingsList } from "@/components/meetings/meetings-list";

export const metadata: Metadata = { title: "Besprechungen" };

/** Project meetings: record → transcript → protocol, tasks and evidenced drafts. */
export default function MeetingsPage() {
  return <MeetingsList />;
}
