// Translation step: every segment → German, language detected per segment.
// One forced tool call per batch of segments, batches in parallel.
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { callTool, mainModel } from "@/lib/agent/llm";
import { findFloors } from "./floors";
import { finalizeSegment, type TranslationOut } from "./language";
import type { Segment } from "./model";

const TOOL: Anthropic.Tool = {
  name: "translate_segments",
  description: "Detect the language of each transcript segment and translate it into German.",
  input_schema: {
    type: "object",
    properties: {
      segments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            i: { type: "integer", description: "Segment index as given." },
            language: { type: "string", description: "ISO 639-1 code of the language spoken in this segment (de, pl, ru, uk, sr, hr, bs, tr, ro, en …)." },
            text_de: { type: "string", description: "German translation. For a German segment: the text unchanged." },
            confidence: { type: "number", description: "0–1. Low (< 0.6) if the transcription looks garbled or incomplete, or the meaning is unclear." },
            mixed: { type: "boolean", description: "True if the speaker switched language inside this segment." },
            issue: { type: "string", description: "Only when confidence < 0.6: short German reason." },
          },
          required: ["i", "language", "text_de", "confidence"],
        },
      },
    },
    required: ["segments"],
  },
};

const SYSTEM = `You translate the transcript of a construction-site meeting in Germany into German. Participants speak their own languages (German, Polish, Russian, Ukrainian, Serbian, Croatian, Bosnian, Turkish, Romanian, English …) and may switch language between or inside segments. For each segment, detect the language actually spoken and translate it into plain German as used on a German construction site.

Rules:
- German segments: return the text unchanged.
- Never translate or change: names of people and companies, case IDs (KL-…, MT-…), plan revisions ("Revision C"), numbers, dates, times, units, quantities.
- Use the German site terms: Estrich, Trockenbau, Elektro, Rohbau, Polier, Bauleiter, Bauherr, Nachunternehmer (NU), Behinderung, Nachtrag, Mehrkosten, Anordnung, Leistungsverzeichnis (LV), Abnahme, Mangel, Bedenken, Freigabe, Bemusterung, OG, EG, UG.
- Floors in German counting ("2. OG", "EG"). Russian and Ukrainian count the ground floor as floor 1: "3-й этаж / третий этаж / третій поверх" = 2. OG, "1-й этаж" = EG. Polish (piętro), Serbian/Croatian/Bosnian (sprat, kat), Turkish (kat), Romanian (etaj) and British English count like German: floor N above ground = "N. OG"; parter / prizemlje / zemin kat / ground floor = EG. US English "first floor" is ambiguous: write "EG/1. OG?" and lower the confidence. When a segment lists "Etagen", use exactly those German floors.
- Translate faithfully, do not summarise, add or soften. Keep "erst", "nicht", "bis" and other qualifiers.
- confidence reflects both: does the transcribed text make sense (speech recognition may have garbled it), and is your translation certain.
Respond only by calling translate_segments.`;

const BATCH = 30;

/**
 * Segments without a German text get one. `stt` holds the speech-recognition
 * confidence per segment index when known. Throws if the model fails, so the
 * pipeline can fall back.
 */
export async function translateSegments(segments: Segment[], stt: (number | null)[] = []): Promise<Segment[]> {
  const todo = segments.map((s, i) => ({ s, i })).filter(({ s }) => s.text_de === null);
  const batches: { s: Segment; i: number }[][] = [];
  for (let k = 0; k < todo.length; k += BATCH) batches.push(todo.slice(k, k + BATCH));

  const results = await Promise.all(
    batches.map(async (batch) => {
      const lines = batch
        .map(({ s, i }) => {
          const floors = findFloors(s.text_original).map((f) => `„${f.match}“ = ${f.de}`);
          return `[${i}] ${s.speaker}: ${s.text_original}${floors.length ? `\n    Etagen: ${floors.join("; ")}` : ""}`;
        })
        .join("\n");
      const call = await callTool<{ segments?: (TranslationOut & { i?: number })[] }>({
        model: mainModel(),
        system: SYSTEM,
        user: `Segmente:\n${lines}`,
        tool: TOOL,
        maxTokens: 8000,
        cache: true,
      });
      const out = new Map<number, TranslationOut>();
      for (const x of call.input.segments ?? []) if (x && typeof x.i === "number") out.set(x.i, x);
      return out;
    }),
  );
  const byIndex = new Map<number, TranslationOut>();
  for (const r of results) for (const [i, x] of r) byIndex.set(i, x);
  return segments.map((s, i) => (s.text_de === null ? finalizeSegment(s, byIndex.get(i), stt[i] ?? null) : s));
}
