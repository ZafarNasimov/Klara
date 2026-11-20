import "server-only";

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function handle<T>(fn: () => Promise<T>) {
  try {
    return Response.json(await fn());
  } catch (e) {
    console.error(e);
    return jsonError(e instanceof Error ? e.message : "Unbekannter Fehler", 500);
  }
}
