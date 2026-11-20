import { Suspense } from "react";
import { ChannelView } from "./channel-view";

export default function ChannelPage({ params }: { params: Promise<{ teamId: string }> }) {
  return (
    <Suspense>
      <Resolve params={params} />
    </Suspense>
  );
}

async function Resolve({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  return <ChannelView teamId={teamId} />;
}
