import type { Metadata } from "next";
import { Suspense } from "react";
import { store } from "@/lib/db";
import { CallView } from "./call-view";

export const metadata: Metadata = { title: "Gespräch mit Klara" };

/** Call screen (SPEC §8 /app/call/[callId]); `new?team=…` starts a call, `?incoming=1` rings first. */
export default function CallPage({ params, searchParams }: PageProps<"/app/call/[callId]">) {
  return (
    <Suspense>
      <Call params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Call({
  params,
  searchParams,
}: {
  params: PageProps<"/app/call/[callId]">["params"];
  searchParams: PageProps<"/app/call/[callId]">["searchParams"];
}) {
  const [{ callId }, sp] = await Promise.all([params, searchParams]);
  const team = typeof sp.team === "string" ? sp.team : null;
  const teamName = team ? ((await store().get("team", team))?.name ?? null) : null;
  return <CallView callId={callId} teamId={team} teamName={teamName} incoming={sp.incoming === "1"} />;
}
