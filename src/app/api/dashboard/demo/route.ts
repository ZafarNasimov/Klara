import { connection } from "next/server";
import { handle } from "@/lib/api";
import { IDS } from "@/lib/ids";
import { berlinDay, berlinTime, demoDay } from "@/lib/deadlines";
import { dashboardFromSeed, demoSeed } from "@/lib/dashboard/from-seed";
import type { Case } from "@/lib/types";

/**
 * Pitch Scene 5: the dashboard of a freshly reset demo (no database), and the
 * same after the golden-path call's Behinderungsanzeige KL-2026-0042 arrived.
 */
export async function GET() {
  await connection();
  return handle(async () => {
    // On a Sunday or holiday the pitch plays the next working day's morning (as the reset does).
    const real = new Date();
    const day = demoDay(real);
    const now = day === berlinDay(real) ? real : berlinTime(day, 8, 30);
    const seed = demoSeed(now);
    const callStart = berlinTime(day, 7, 0);
    const call: Case = {
      id: "pitch-call-case",
      project_id: IDS.project,
      team_id: IDS.teamEstrich,
      conversation_id: null,
      doc_type: "behinderungsanzeige",
      status: "bereit",
      sphere: "client",
      facts: { _trade: "Elektro", area: "2.OG", start_at: callStart.toISOString(), cause: "Elektroarbeiten im 2.OG nicht abgeschlossen", expected_duration: "ca. 2 Arbeitstage" },
      missing_fields: [],
      checks: [],
      deadline_at: null,
      deadline_rule: null,
      parent_case_id: null,
      reference: "KL-2026-0042",
      created_by: IDS.userPolierEstrich,
      asked_fields: [],
      declined_fields: [],
      flags: [],
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    return { before: dashboardFromSeed(seed, now), after: dashboardFromSeed({ ...seed, case: [...(seed.case ?? []), call] }, now) };
  });
}
