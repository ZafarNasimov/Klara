import { describe, expect, it } from "vitest";
import { CALL_TIMING, readingTimeMs, turnSchedule } from "./call-timing";

describe("call timing (pitch Scene 2)", () => {
  it("REPLAY: document at +1500 ms, typing from then, reply at +2500 ms", () => {
    expect(turnSchedule(10_000)).toEqual({ docAt: 11_500, typingAt: 11_500, replyAt: 12_500 });
  });

  it("LIVE: a fast backend is held back to the minimums", () => {
    expect(turnSchedule(0, { docReadyAt: 200, replyAt: 400 })).toEqual({ docAt: 1500, typingAt: 1500, replyAt: 2500 });
  });

  it("LIVE: a slow document delays the update and the typing that follows it", () => {
    const s = turnSchedule(0, { docReadyAt: 2600, replyAt: 2700 });
    expect(s.docAt).toBe(2600);
    expect(s.replyAt - s.typingAt).toBe(CALL_TIMING.typingMinMs);
  });

  it("LIVE: a slow reply keeps the typing indicator up until it arrives", () => {
    const s = turnSchedule(0, { docReadyAt: 900, replyAt: 7200 });
    expect(s).toEqual({ docAt: 1500, typingAt: 1500, replyAt: 7200 });
  });

  it("AUTO pacing reads max(1500 ms, 40 ms per character)", () => {
    expect(readingTimeMs("Who hired the electricians — the client or us?")).toBe(840);
    expect(readingTimeMs("Ok.")).toBe(500);
  });
});
