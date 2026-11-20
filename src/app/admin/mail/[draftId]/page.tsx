import { Suspense } from "react";

/** E-mail composer (SPEC §8 /admin/mail/[draftId], built in M4). */
export default function MailPage({ params }: PageProps<"/admin/mail/[draftId]">) {
  return (
    <Suspense>
      <Mail params={params} />
    </Suspense>
  );
}

async function Mail({ params }: { params: PageProps<"/admin/mail/[draftId]">["params"] }) {
  await params;
  return <main className="p-6 text-sm text-muted-foreground">E-Mail vorbereiten</main>;
}
