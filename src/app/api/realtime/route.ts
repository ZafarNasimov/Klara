// Server-Sent Events for live admin updates when Supabase Realtime is not
// configured in the browser. Memory backend: push every store change.
// Supabase backend: poll the event table (cheap; one indexed query per 2 s).
import { connection } from "next/server";
import { dataBackend, store } from "@/lib/db";
import { onMemoryChange } from "@/lib/db/memory-store";

export const maxDuration = 300;

export async function GET(req: Request) {
  await connection();
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };
      const ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {}
      }, 15000);
      let stop: () => void;
      if (dataBackend() === "memory") {
        stop = onMemoryChange((c) => send({ table: c.table, op: c.op }));
      } else {
        // Compare ids, not timestamps: the demo clock can move backwards.
        let seen: Set<string> | null = null;
        const poll = setInterval(async () => {
          try {
            const latest = await store().list("event", { order: { column: "created_at", ascending: false }, limit: 20 });
            const ids = new Set(latest.map((e) => e.id));
            if (seen && [...ids].some((id) => !seen!.has(id))) send({ table: "event", op: "insert" });
            seen = ids;
          } catch {}
        }, 2000);
        stop = () => clearInterval(poll);
      }
      cleanup = () => {
        clearInterval(ping);
        stop();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
      send({ hello: true });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
