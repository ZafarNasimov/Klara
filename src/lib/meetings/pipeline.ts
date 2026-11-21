// End a meeting → Transkription → Sprecher erkennen → Entscheidungen & Aufgaben
// → Vorlagen prüfen. Each step is saved as it finishes (the UI polls).
import "server-only";
import { getProjectContext, uid } from "@/lib/db/repo";
import { berlinDay } from "@/lib/deadlines";
import { readFile, saveFile } from "@/lib/files";
import { llmMode } from "@/lib/runtime";
import { diarize, transcribeSegments } from "@/lib/voice/openai";
import { applyItems } from "./apply";
import { extractWithLlm } from "./extract";
import { ruleExtract, ruleSummary, verifyItems } from "./items";
import { emptySteps, type MeetingProtocol, type ProcessingStep, type Segment } from "./model";
import { getMeeting, patchMeeting, requireRow } from "./repo";
import { SAMPLE_RESULT, type RawItem } from "./sample";

export const chunkKey = (meetingId: string, seq: number) => `meetings/${meetingId}/chunk-${String(seq).padStart(5, "0")}`;

/** Store one recorded chunk (sequential uploads from the recorder). */
export async function saveChunk(meetingId: string, seq: number, bytes: Buffer, mime: string): Promise<number> {
  await saveFile(chunkKey(meetingId, seq), bytes, mime || "audio/webm");
  const row = await requireRow(meetingId);
  const p = row.protocol as MeetingProtocol;
  const chunks = Math.max(p.chunks ?? 0, seq + 1);
  await patchMeeting(meetingId, { chunks, ...(mime ? { audio_mime: mime } : {}) });
  return chunks;
}

async function assembleAudio(meetingId: string, p: MeetingProtocol): Promise<{ blob: Blob; name: string } | null> {
  const parts: Buffer[] = [];
  for (let i = 0; i < (p.chunks ?? 0); i++) {
    const b = await readFile(chunkKey(meetingId, i));
    if (b) parts.push(b);
  }
  if (!parts.length) return null;
  const mime = p.audio_mime || "audio/webm";
  const ext = mime.includes("mp4") || mime.includes("m4a") ? "m4a" : mime.includes("mpeg") || mime.includes("mp3") ? "mp3" : mime.includes("wav") ? "wav" : mime.includes("ogg") ? "ogg" : "webm";
  const all = Buffer.concat(parts);
  await saveFile(`meetings/${meetingId}/audio.${ext}`, all, mime);
  return { blob: new Blob([new Uint8Array(all)], { type: mime }), name: `besprechung.${ext}` };
}

/**
 * Run the whole pipeline for one meeting. `sample`: the transcript is the
 * Beispielaufnahme; if the LLM is unreachable it falls back to the stored
 * sample result (and says so). Errors end in status "failed" with a reason.
 */
export async function processMeeting(id: string, at: Date, opts: { sample?: boolean } = {}): Promise<void> {
  const steps = emptySteps();
  const mark = async (s: ProcessingStep, extra: Partial<MeetingProtocol> = {}, more: { transcript?: Segment[] } = {}) => {
    steps[s] = true;
    await patchMeeting(id, { steps: { ...steps }, ...extra }, more);
  };
  try {
    await patchMeeting(id, { status: "processing", steps: { ...steps }, error: null, notice: null });
    const row = await requireRow(id);
    let m = await getMeeting(id);
    const ctx = await getProjectContext(m.project_id);

    // 1. Transkription
    let segments = m.transcript;
    if (!segments.length) {
      const audio = await assembleAudio(id, row.protocol as MeetingProtocol);
      if (!audio) throw new Error("Es wurde keine Aufnahme hochgeladen.");
      // Words from Whisper, speaker turns from the diarizer (in parallel).
      const [raw, turns] = await Promise.all([transcribeSegments(audio.blob, audio.name, "de"), diarize(audio.blob, audio.name)]);
      if (!raw.length) throw new Error("In der Aufnahme wurde keine Sprache erkannt.");
      segments = raw.map((s) => ({ speaker: speakerTurn(s, turns), start_sec: Math.round(s.start), text: s.text }));
    }
    await mark("transcription", {}, { transcript: segments });

    // 2.+3. Sprecher erkennen, Entscheidungen & Aufgaben
    let summary: string[];
    let raw: RawItem[];
    let notice: string | null = null;
    if (llmMode() === "live") {
      try {
        const r = await extractWithLlm(m, segments, ctx);
        if (r.speakers.length && segments.every((s) => s.speaker.startsWith("Sprecher"))) {
          // Only names with evidence: a participant, or a person named in the transcript itself.
          const names = new Set(m.participants.map((p) => p.name));
          const said = segments.map((s) => s.text).join(" ");
          const named = (who: string) => names.has(who) || (who.length > 3 && said.includes(who.replace(/^(Herr|Frau)\s+/, "")));
          segments = segments.map((s) => {
            const who = r.speakers.find((x) => x.label === s.speaker)?.name?.trim();
            return who && named(who) ? { ...s, speaker: who } : s;
          });
        }
        summary = r.summary;
        raw = r.items;
      } catch (err) {
        console.warn("[meetings] LLM extraction failed:", err);
        if (opts.sample) {
          summary = SAMPLE_RESULT.summary;
          raw = SAMPLE_RESULT.items;
          notice = "Klara-KI nicht erreichbar: gespeichertes Ergebnis der Beispielaufnahme verwendet.";
        } else {
          raw = ruleExtract(segments);
          summary = ruleSummary(raw);
          notice = "Klara-KI nicht erreichbar: ohne KI nach festen Regeln ausgewertet, bitte prüfen.";
        }
      }
    } else {
      raw = ruleExtract(segments);
      summary = ruleSummary(raw);
      notice = "Testmodus: ohne KI nach festen Regeln ausgewertet.";
    }
    await mark("speakers", {}, { transcript: segments });
    const items = verifyItems(raw, segments, { meetingId: id, baseDay: berlinDay(new Date(m.started_at)), newId: uid });
    await mark("items", { summary, items, notice });

    // 4. Vorlagen prüfen
    m = await getMeeting(id);
    const applied = await applyItems(m, items, at);
    await mark("templates", { items: applied.items, changes: applied.changes, status: "ready" });
  } catch (err) {
    console.error("[meetings] processing failed:", err);
    await patchMeeting(id, { status: "failed", error: err instanceof Error ? err.message : "Auswertung fehlgeschlagen." }).catch(() => {});
  }
}

/** The diarized speaker ("Sprecher A") that overlaps a Whisper segment most; "Sprecher" without turns. */
function speakerTurn(seg: { start: number; end: number }, turns: { start: number; end: number; speaker: string }[]): string {
  let best: string | null = null;
  let most = 0;
  const totals = new Map<string, number>();
  for (const t of turns) {
    const overlap = Math.min(seg.end || seg.start, t.end) - Math.max(seg.start, t.start);
    if (overlap <= 0) continue;
    const sum = (totals.get(t.speaker) ?? 0) + overlap;
    totals.set(t.speaker, sum);
    if (sum > most) {
      most = sum;
      best = t.speaker;
    }
  }
  return best ? `Sprecher ${best}` : "Sprecher";
}
