// Small helpers for route handlers: JSON errors with German messages.
import "server-only";
import { NotFoundError } from "@/lib/db/store";

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

/** An error with its own HTTP status and a message meant for the user (e.g. a missing voice key → 503). */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/** Run a handler body and map known errors to HTTP status codes. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const out = await fn();
    return out instanceof Response ? out : Response.json(out);
  } catch (err) {
    if (err instanceof NotFoundError) return jsonError(err.message, 404);
    if (err instanceof BadRequestError) return jsonError(err.message, 400);
    if (err instanceof HttpError) {
      if (err.status >= 500) console.error("[klara] request failed", err.message);
      return jsonError(err.message, err.status);
    }
    console.error("[klara] request failed", err);
    return jsonError(err instanceof Error ? err.message : "Unbekannter Fehler", 500);
  }
}

/** Parse a JSON body; throws BadRequestError on invalid JSON. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new BadRequestError("Ungültiger JSON-Body");
  }
}

export function requireString(v: unknown, name: string): string {
  if (typeof v !== "string" || !v.trim()) throw new BadRequestError(`${name} fehlt`);
  return v;
}
