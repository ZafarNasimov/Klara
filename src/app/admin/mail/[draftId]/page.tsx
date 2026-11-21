import type { Metadata } from "next";
import { Suspense } from "react";
import { MailComposer } from "./composer";

export const metadata: Metadata = { title: "E-Mail" };

/** E-mail composer (SPEC §8 /admin/mail/[draftId]); `new?case=<id>` prepares the case's draft. */
export default function MailPage({ params, searchParams }: PageProps<"/admin/mail/[draftId]">) {
  return (
    <Suspense>
      <Mail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Mail({
  params,
  searchParams,
}: {
  params: PageProps<"/admin/mail/[draftId]">["params"];
  searchParams: PageProps<"/admin/mail/[draftId]">["searchParams"];
}) {
  const [{ draftId }, sp] = await Promise.all([params, searchParams]);
  const caseId = typeof sp.case === "string" ? sp.case : null;
  return <MailComposer draftId={draftId} caseId={caseId} />;
}
