import { connection } from "next/server";
import { jsonError } from "@/lib/api";
import { getCase } from "@/lib/db/repo";
import { auditData, getVersion } from "@/lib/documents/generate";
import type { DocBody } from "@/lib/documents/model";
import { renderPdf } from "@/lib/documents/render-pdf";

// ?audit=1 adds the internal audit page (never attached to outgoing mail).
export async function GET(req: Request, ctx: RouteContext<"/api/documents/[id]/pdf">) {
  await connection();
  const { id } = await ctx.params;
  const v = await getVersion(id);
  if (!v) return jsonError("Dokument nicht gefunden", 404);
  const c = await getCase(v.case_id);
  const url = new URL(req.url);
  const withAudit = url.searchParams.get("audit") === "1";
  const pdf = await renderPdf(v.body as DocBody, withAudit ? await auditData(v) : null);
  const name = `${c?.reference ?? "Klara"}_${c?.doc_type ?? "dokument"}_v${v.version}${withAudit ? "_intern" : ""}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
