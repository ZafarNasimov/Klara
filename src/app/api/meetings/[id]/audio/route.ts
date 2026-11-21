import { connection } from "next/server";
import { BadRequestError, handle } from "@/lib/api";
import { saveChunk } from "@/lib/meetings/pipeline";

/**
 * One audio chunk: POST raw bytes with ?seq=0,1,2… (the recorder uploads every
 * few seconds, in order). "Audio hochladen" sends the whole file as seq=0.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/meetings/[id]/audio">) {
  await connection();
  return handle(async () => {
    const seq = Number(new URL(req.url).searchParams.get("seq"));
    if (!Number.isInteger(seq) || seq < 0 || seq > 10_000) throw new BadRequestError("Ungültiger Abschnitt");
    const bytes = Buffer.from(await req.arrayBuffer());
    if (!bytes.length) throw new BadRequestError("Leerer Abschnitt");
    if (bytes.length > 4_000_000) throw new BadRequestError("Abschnitt zu groß (max. 4 MB)");
    const mime = (req.headers.get("content-type") ?? "audio/webm").split(";")[0];
    return { chunks: await saveChunk((await ctx.params).id, seq, bytes, mime) };
  });
}
