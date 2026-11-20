import { Suspense } from "react";
import { ChannelView } from "./channel-view";

export default function ChannelPage({ params }: PageProps<"/app/channel/[teamId]">) {
  return (
    <Suspense>
      <Channel params={params} />
    </Suspense>
  );
}

async function Channel({ params }: { params: PageProps<"/app/channel/[teamId]">["params"] }) {
  const { teamId } = await params;
  return <ChannelView teamId={teamId} />;
}
