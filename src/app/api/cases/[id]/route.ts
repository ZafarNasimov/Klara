import { connection } from "next/server";
import { handle } from "@/lib/api";
import { getCase, listDocumentVersions, listEvents, listEvidence, requireCase, toCaseViews } from "@/lib/db/repo";
import { store } from "@/lib/db";

/** One case with versions, evidence, timeline and linked cases. */
export async function GET(_req: Request, ctx: RouteContext<"/api/cases/[id]">) {
  await connection();
  return handle(async () => {
    const { id } = await ctx.params;
    const c = await requireCase(id);
    const [versions, evidence, events, children, parent] = await Promise.all([
      listDocumentVersions(id),
      listEvidence(id),
      listEvents({ caseId: id }),
      store().list("case", { where: { parent_case_id: id }, order: { column: "created_at" } }),
      c.parent_case_id ? getCase(c.parent_case_id) : Promise.resolve(null),
    ]);
    const [view, ...linked] = await toCaseViews([c, ...(parent ? [parent] : []), ...children]);
    return {
      case: view,
      parent: parent ? linked[0] : null,
      children: parent ? linked.slice(1) : linked,
      versions,
      evidence,
      events,
    };
  });
}
