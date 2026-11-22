// Speech-to-text: the vocabulary hint only for German, and the model's "echo" of
// its own hint (a short or unclear answer) is never passed on as the words said.
import { afterEach, describe, expect, it, vi } from "vitest";
import { echoesPrompt, STT_GLOSSARY, transcribe } from "./openai";

const GLOSSARY = STT_GLOSSARY.de;
const audio = new Blob([new Uint8Array(8)], { type: "audio/wav" });

/** Fake OpenAI: answers in order and records what was sent. */
function fakeStt(...answers: string[]) {
  const sent: { language: string | null; prompt: string | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: FormData }) => {
      sent.push({ language: (init.body.get("language") as string) ?? null, prompt: (init.body.get("prompt") as string) ?? null });
      return new Response(JSON.stringify({ text: answers.shift() ?? "" }), { status: 200 });
    }),
  );
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("speech-to-text", () => {
  it("recognises the hint coming back instead of the words", () => {
    expect(echoesPrompt("Baustelle, Bauleitung, Polier, Estrich, Trockenbau, Elektro, 2.OG, Behinderung, Mehrkosten, m².", GLOSSARY)).toBe(true);
    expect(echoesPrompt("Baustelle, Bauleitung, Polier, Estrich.", GLOSSARY)).toBe(true);
    expect(echoesPrompt("Five men.", GLOSSARY)).toBe(false);
    expect(echoesPrompt("Der Estrich im 2.OG ist fertig, die Bauleitung weiß Bescheid.", GLOSSARY)).toBe(false);
  });

  it("English speaker (Liam): no German hint, the language is sent", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    const sent = fakeStt("Five men.");
    expect(await transcribe(audio, "a.wav", "en")).toBe("Five men.");
    expect(sent).toEqual([{ language: "en", prompt: null }]);
  });

  it("before the first sentence: the Polier's language picks the hint, nothing is forced", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    const en = fakeStt("Hi Klara.");
    await transcribe(audio, "a.wav", null, "en");
    expect(en).toEqual([{ language: null, prompt: null }]);
    const de = fakeStt("Hallo Klara.");
    await transcribe(audio, "a.wav", null, "de");
    expect(de).toEqual([{ language: null, prompt: GLOSSARY }]);
  });

  it("German speaker: an echo of the hint is asked again without it", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    const sent = fakeStt(GLOSSARY, "Fünf Mann.");
    expect(await transcribe(audio, "a.wav", "de")).toBe("Fünf Mann.");
    expect(sent.map((s) => s.prompt)).toEqual([GLOSSARY, null]);
  });

  it("still only the hint after asking again: treated as not understood (empty)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    fakeStt(GLOSSARY, GLOSSARY);
    expect(await transcribe(audio, "a.wav", "de")).toBe("");
  });
});
