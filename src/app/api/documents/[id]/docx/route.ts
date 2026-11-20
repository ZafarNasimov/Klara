import { connection } from "next/server";
import { handle } from "@/lib/api";
import { renderDocx } from "@/lib/documents/docx";
import { auditInfo, requireVersion } from "@/lib/documents/generate";

/** Word file of a document version (letter only). */
export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]/docx">) {
  await connection();
  return handle(async () => {
    const { id } = await ctx.params;
    const v = await requireVersion(id);
    const { body, c } = await auditInfo(v);
    const buf = await renderDocx(body);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${c.reference}_v${v.version}.docx"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
