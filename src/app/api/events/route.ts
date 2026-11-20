import { connection } from "next/server";
import { handle } from "@/lib/api";
import { listEvents } from "@/lib/db/repo";

export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  return handle(() =>
    listEvents({ projectId: url.searchParams.get("project") ?? undefined, limit: 50 }),
  );
}
