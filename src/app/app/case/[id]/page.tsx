import { Suspense } from "react";
import { MobileHeader } from "@/components/mobile/mobile-header";

/** Mobile case card (SPEC §8, built in M2). */
export default function MobileCasePage({ params }: PageProps<"/app/case/[id]">) {
  return (
    <Suspense>
      <MobileCase params={params} />
    </Suspense>
  );
}

async function MobileCase({ params }: { params: PageProps<"/app/case/[id]">["params"] }) {
  await params;
  return (
    <>
      <MobileHeader title="Vorgang" backHref="/app" />
      <main className="flex-1 p-4" />
    </>
  );
}
