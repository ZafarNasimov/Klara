// Server-sent events for the memory backend. With Supabase configured, the
// browser subscribes to Supabase Realtime instead (see lib/realtime-client.ts).
import { connection } from "next/server";
import { memoryBus } from "@/lib/db/memory-store";

export async function GET(req: Request) {
  await connection();
  const bus = memoryBus();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const onChange = (change: { table: string; type: string; row: unknown }) => send(change);
      bus.on("change", onChange);
      const ping = setInterval(() => send({ type: "PING" }), 20000);
      cleanup = () => {
        clearInterval(ping);
        bus.off("change", onChange);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
      send({ type: "HELLO" });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
