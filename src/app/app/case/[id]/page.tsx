import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileCaseView } from "./case-view";

export const metadata: Metadata = { title: "Vorgang" };

/** Mobile case page (SPEC §8 /app/case/[id]). */
export default function MobileCasePage({ params }: PageProps<"/app/case/[id]">) {
  return (
    <Suspense>
      <MobileCase params={params} />
    </Suspense>
  );
}

async function MobileCase({ params }: { params: PageProps<"/app/case/[id]">["params"] }) {
  const { id } = await params;
  return <MobileCaseView id={id} />;
}
