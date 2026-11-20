// The channel's tap cards send fixed phrases as the user's own words; each one
// must be understood without an AI key, in every language Klara ships.
import { describe, expect, it } from "vitest";
import { CARD_LINES, DOC_SPOKEN, LINES, READBACK_LABELS, WORDS } from "./lines";
import { guessLanguage, mockExtract } from "./mock";
import type { ExtractContext } from "./types";

const ctx = (over: Partial<ExtractContext> = {}): ExtractContext => ({
  nowIso: "2026-11-20T08:30:00.000Z",
  nowBerlin: "Freitag, 20.11.2026, 09:30",
  language: null,
  projectName: "Wohnanlage Isarauen, Haus B",
  trades: ["Elektro", "Estrich"],
  teamName: "Estrich",
  teamTrade: "Estrich",
  todaysSchedule: ["Estrich 2.OG"],
  openCases: [],
  documented: [],
  pendingQuestion: null,
  pendingSphereQuestion: null,
  awaitingConfirm: false,
  history: [],
  ...over,
});

describe("channel card lines", () => {
  const langs = Object.keys(CARD_LINES);

  it("cover every language Klara speaks", () => {
    expect(langs.sort()).toEqual(Object.keys(LINES).sort());
    for (const l of langs) {
      expect(READBACK_LABELS[l], l).toBeDefined();
      expect(DOC_SPOKEN[l], l).toBeDefined();
      expect(WORDS[l], l).toBeDefined();
    }
  });

  it.each(langs)("%s: 'all to plan' is a diary answer in the user's language", (l) => {
    const text = CARD_LINES[l].morningOk;
    expect(mockExtract(text, ctx()).intent).toBe("diary_answer");
    expect(guessLanguage(text)).toBe(l);
  });

  it.each(langs)("%s: 'that's right' confirms a readback", (l) => {
    expect(mockExtract(CARD_LINES[l].confirmYes, ctx({ awaitingConfirm: true })).intent).toBe("confirm");
  });

  it.each(langs)("%s: 'as planned' reports today's quantity", (l) => {
    const ex = mockExtract(`Estrich 2.OG ${WORDS[l].today}: 40`, ctx());
    expect(ex.progress).toMatchObject([{ trade: "Estrich", area: "2.OG", qty: 40 }]);
  });
});
