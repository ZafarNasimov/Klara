import { connection } from "next/server";
import { handle } from "@/lib/api";
import { listProjects } from "@/lib/db/repo";

/** All sites (Baustellen) with their site code, A → C. */
export async function GET() {
  await connection();
  return handle(async () =>
    (await listProjects())
      .map((p) => ({ id: p.id, name: p.name, code: typeof p.settings.site_code === "string" ? p.settings.site_code : "–", contract_no: p.contract_no }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  );
}
