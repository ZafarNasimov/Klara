import { connection } from "next/server";
import { handle, jsonError } from "@/lib/api";
import { getCase, listDocumentVersions, listEvents, listEvidence } from "@/lib/db/repo";

export async function GET(_req: Request, ctx: RouteContext<"/api/cases/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const c = await getCase(id);
  if (!c) return jsonError("Vorgang nicht gefunden", 404);
  return handle(async () => {
    const [versions, evidence, events] = await Promise.all([
      listDocumentVersions(id),
      listEvidence(id),
      listEvents({ caseId: id }),
    ]);
    return { case: c, versions, evidence, events };
  });
}
