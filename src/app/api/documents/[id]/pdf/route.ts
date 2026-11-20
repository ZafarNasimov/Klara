import { connection } from "next/server";
import { handle } from "@/lib/api";
import { auditInfo, requireVersion } from "@/lib/documents/generate";
import { renderPdf } from "@/lib/documents/pdf";

/** PDF of a document version. `?variant=letter` = page 1 only (email attachment); default adds the internal audit page. */
export async function GET(req: Request, ctx: RouteContext<"/api/documents/[id]/pdf">) {
  await connection();
  return handle(async () => {
    const { id } = await ctx.params;
    const v = await requireVersion(id);
    const { body, audit, c } = await auditInfo(v);
    const letterOnly = new URL(req.url).searchParams.get("variant") === "letter";
    const pdf = await renderPdf(body, letterOnly ? null : audit);
    const name = `${c.reference}_v${v.version}${letterOnly ? "" : "_mit_Pruefbericht"}.pdf`;
    const download = new URL(req.url).searchParams.has("download");
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
