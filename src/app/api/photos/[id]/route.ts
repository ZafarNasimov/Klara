import { connection } from "next/server";
import { handle } from "@/lib/api";
import { store } from "@/lib/db";
import { NotFoundError } from "@/lib/db/store";
import { readFile } from "@/lib/files";

/** One stored photo (behind the site login like the rest of the app). */
export async function GET(_req: Request, ctx: RouteContext<"/api/photos/[id]">) {
  await connection();
  return handle(async () => {
    const { id } = await ctx.params;
    const e = await store().get("evidence", id);
    if (!e || e.kind !== "photo" || !e.ref) throw new NotFoundError("photo", id);
    const bytes = await readFile(e.ref);
    if (!bytes) throw new NotFoundError("photo", id);
    const type = typeof e.data.content_type === "string" ? e.data.content_type : "image/jpeg";
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } });
  });
}
