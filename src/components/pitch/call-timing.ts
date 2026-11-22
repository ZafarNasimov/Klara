// Dialogue timing for the call (pitch Scene 2, spec update 2026-11-21).
// One policy for REPLAY and LIVE: the screen never runs faster than a real
// conversation. Per turn:
//   foreman's message → (≥ 1.5 s) document update + Klara typing
//   → (≥ 1 s of typing) Klara's full reply.

export const CALL_TIMING = {
  /** Document update, at the earliest, after the foreman's final words. */
  docAfterForemanMs: 1500,
  /** Klara's typing indicator stays up at least this long. */
  typingMinMs: 1000,
  /** A press during a turn queues the next foreman line this long after Klara's reply. */
  queueGapMs: 400,
  /** After Klara's last reply, before the document moves left. */
  afterLastReplyMs: 1000,
  /** AUTO pacing: reading time for Klara's reply before the next foreman line. */
  readingMinMs: 1500,
  readingPerCharMs: 40,
  /** AUTO pacing: first foreman line after the scene enters. */
  autoStartMs: 1000,
} as const;

/** AUTO pacing: how long the jury gets to read Klara's reply. */
export function readingTimeMs(text: string): number {
  return Math.max(CALL_TIMING.readingMinMs, CALL_TIMING.readingPerCharMs * text.length);
}

export type TurnSchedule = {
  /** When the document fields of this turn fill (and Klara's typing indicator appears). */
  docAt: number;
  typingAt: number;
  /** When Klara's full reply replaces the typing indicator. */
  replyAt: number;
};

/**
 * When to show each part of a turn, in ms on one clock.
 *
 * REPLAY passes no backend times and gets the exact minimums (1500 / 2500 ms
 * after the foreman). LIVE passes when the backend's document update and
 * reply actually arrived: nothing is shown earlier than the minimums, and a
 * slower backend simply keeps the typing indicator up until its reply lands.
 */
export function turnSchedule(foremanFinalAt: number, backend: { docReadyAt?: number; replyAt?: number } = {}): TurnSchedule {
  const docAt = Math.max(foremanFinalAt + CALL_TIMING.docAfterForemanMs, backend.docReadyAt ?? -Infinity);
  const replyAt = Math.max(docAt + CALL_TIMING.typingMinMs, backend.replyAt ?? -Infinity);
  return { docAt, typingAt: docAt, replyAt };
}
