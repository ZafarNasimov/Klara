import { handle } from "@/lib/api";
import { addEvent, DEFAULT_PROJECT_ID, resetDemo } from "@/lib/db/repo";

/** "Demo zurücksetzen": wipe all data and load the seed again. */
export async function POST() {
  return handle(async () => {
    await resetDemo();
    // Signals every open screen (realtime listens to new events).
    await addEvent({ project_id: DEFAULT_PROJECT_ID, case_id: null, kind: "demo_reset", payload: {} }, new Date());
    return { ok: true };
  });
}
