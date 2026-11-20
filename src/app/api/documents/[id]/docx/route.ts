import { connection } from "next/server";
import { jsonError } from "@/lib/api";
import { getCase } from "@/lib/db/repo";
import { getVersion } from "@/lib/documents/generate";
import type { DocBody } from "@/lib/documents/model";
import { renderDocx } from "@/lib/documents/render-docx";

export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]/docx">) {
  await connection();
  const { id } = await ctx.params;
  const v = await getVersion(id);
  if (!v) return jsonError("Dokument nicht gefunden", 404);
  const c = await getCase(v.case_id);
  const buf = await renderDocx(v.body as DocBody);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${c?.reference ?? "Klara"}_${c?.doc_type ?? "dokument"}_v${v.version}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
