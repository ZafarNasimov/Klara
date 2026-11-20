import { connection } from "next/server";
import { handle } from "@/lib/api";
import { getProjectContext } from "@/lib/db/repo";

export async function GET(req: Request) {
  await connection();
  const id = new URL(req.url).searchParams.get("id") ?? undefined;
  return handle(() => getProjectContext(id));
}
