// Per-request step timing for the slow paths (voice and chat turns). Code deep
// in the call (store, model calls, documents) records steps through
// AsyncLocalStorage, so nothing has to be passed down. Outside a timed request
// (tests, scripts) every helper is a no-op.
//
// Output: one log line per request and a `Server-Timing` header, which the
// browser's network panel shows per request.
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

type Step = { ms: number; count: number; inflight: number; since: number };

class Timing {
  private readonly started = performance.now();
  private readonly steps = new Map<string, Step>();
  private readonly notes: string[] = [];

  constructor(readonly label: string) {}

  private step(name: string): Step {
    let s = this.steps.get(name);
    if (!s) this.steps.set(name, (s = { ms: 0, count: 0, inflight: 0, since: 0 }));
    return s;
  }

  add(name: string, ms: number) {
    const s = this.step(name);
    s.ms += ms;
    s.count += 1;
  }

  /** Wall-clock mode: overlapping calls of the same step count once. */
  enter(name: string) {
    const s = this.step(name);
    if (s.inflight++ === 0) s.since = performance.now();
    s.count += 1;
  }

  exit(name: string) {
    const s = this.step(name);
    if (--s.inflight === 0) s.ms += performance.now() - s.since;
  }

  note(text: string) {
    this.notes.push(text);
  }

  elapsed() {
    return performance.now() - this.started;
  }

  /** `Server-Timing` value: `stt;dur=1150, llm.record_turn;dur=4200;desc="1x", …, total;dur=6100`. */
  header(total: number): string {
    const steps = [...this.steps].map(([name, s]) => `${name};dur=${Math.round(s.ms)}${s.count > 1 ? `;desc="${s.count}x"` : ""}`);
    return [...steps, `total;dur=${Math.round(total)}`].join(", ");
  }

  line(total: number): string {
    const steps = [...this.steps].map(([name, s]) => `${name}=${Math.round(s.ms)}ms${s.count > 1 ? `(${s.count}x)` : ""}`);
    return [`${this.label} total=${Math.round(total)}ms`, ...steps, ...this.notes].join(" ");
  }
}

const current = new AsyncLocalStorage<Timing>();

/**
 * Time one step of the current request. Repeated names add up (count shown).
 * By default calls that run in parallel each add their own time, so a sum can
 * exceed the wall-clock total; `overlap: "wall"` counts the time with at least
 * one call of that step in flight instead (store round trips).
 */
export async function timed<T>(name: string, fn: () => Promise<T>, opts?: { overlap?: "sum" | "wall" }): Promise<T> {
  const t = current.getStore();
  if (!t) return fn();
  if (opts?.overlap === "wall") {
    t.enter(name);
    try {
      return await fn();
    } finally {
      t.exit(name);
    }
  }
  const start = performance.now();
  try {
    return await fn();
  } finally {
    t.add(name, performance.now() - start);
  }
}

/** Free-form detail for the log line (model, tokens). */
export function timingNote(text: string): void {
  current.getStore()?.note(text);
}

/** Milliseconds since the current timed request started; null outside one. */
export function timingElapsed(): number | null {
  return current.getStore()?.elapsed() ?? null;
}

/** Run a route handler with timing: logs one line and sets `Server-Timing` on the response. */
export async function withTiming(label: string, fn: () => Promise<Response>): Promise<Response> {
  const t = new Timing(label);
  const res = await current.run(t, fn);
  const total = t.elapsed();
  console.info(`[klara] timing ${t.line(total)}`);
  try {
    res.headers.set("Server-Timing", t.header(total));
  } catch {
    // Responses passed through from fetch have immutable headers; the log line is enough.
  }
  return res;
}
