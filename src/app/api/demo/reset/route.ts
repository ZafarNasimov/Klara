import { handle } from "@/lib/api";
import { resetDemo } from "@/lib/db/repo";

export async function POST() {
  return handle(async () => {
    await resetDemo();
    return { ok: true };
  });
}
