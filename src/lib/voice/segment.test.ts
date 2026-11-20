import { describe, expect, it } from "vitest";
import { isNoise } from "./segment";

describe("isNoise", () => {
  it("drops empty segments, fillers and silence hallucinations", () => {
    for (const t of ["", "  ", "...", "Äh", "ähm.", "Hmm", "uh", "Э", "a", "Thank you.", "Untertitel der Amara.org-Community", "Продолжение следует..."]) {
      expect(isNoise(t), t).toBe(true);
    }
  });
  it("keeps short answers and real reports", () => {
    for (const t of ["Ja.", "Nein", "Yes", "Да", "Tak", "zwei", "2", "Ok", "Etwa zwei Tage.", "The electricians haven't cleared the second floor."]) {
      expect(isNoise(t), t).toBe(false);
    }
  });
});
