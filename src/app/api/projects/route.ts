import { connection } from "next/server";
import { handle } from "@/lib/api";
import { getProjectContext, listCases, listProjects } from "@/lib/db/repo";
import { isOpenCase } from "@/lib/doctypes";

export type ProjectSummary = {
  id: string;
  name: string;
  address: string;
  contract_type: string;
  contract_no: string;
  teams: { id: string; name: string; lead_name: string | null; lead_language: string | null; open_cases: number }[];
};

/** All sites with their team channels (the Polier's start page). */
export async function GET() {
  await connection();
  return handle(async (): Promise<ProjectSummary[]> => {
    const projects = await listProjects();
    return Promise.all(
      projects.map(async (p) => {
        const [ctx, cases] = await Promise.all([getProjectContext(p.id), listCases(p.id)]);
        return {
          id: p.id,
          name: p.name,
          address: p.address,
          contract_type: p.contract_type,
          contract_no: p.contract_no,
          teams: ctx.teams.map((t) => {
            const lead = ctx.users.find((u) => u.id === t.lead_user_id) ?? null;
            return {
              id: t.id,
              name: t.name,
              lead_name: lead?.name ?? null,
              lead_language: lead?.language ?? null,
              open_cases: cases.filter((c) => c.team_id === t.id && isOpenCase(c)).length,
            };
          }),
        };
      }),
    );
  });
}
