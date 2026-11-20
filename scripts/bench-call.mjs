// Times a scripted call against a running dev server, turn by turn.
//
//   node scripts/bench-call.mjs [--base http://localhost:3000] [--lang en|de] [--runs 3] [--voice]
//
// Text mode posts to /api/agent/turn; --voice first renders each line with the
// app's own /api/tts (cached in .data/bench-audio/) and posts the MP3 to
// /api/voice, so speech-to-text is in the measurement. Every turn prints the
// wall time and the server's Server-Timing steps. Each run opens a new call for
// Team Estrich; nothing is reset, so point it at a memory-backend server
// (DATA_BACKEND=memory) unless you want the cases in Supabase.
//
// Billed: live Claude calls, and in --voice mode OpenAI speech-to-text (and TTS
// once per line until cached).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const BASE = opt("base", "http://localhost:3000");
const LANG = opt("lang", "en");
const RUNS = Number(opt("runs", "1"));
const VOICE = args.includes("--voice");
const TEAM = "00000000-0000-4000-8000-000000000301"; // Team Estrich (IDS.teamEstrich)

// SPEC §1 golden path. Answers are used in order for Klara's questions; a readback gets the yes.
const SCRIPT = {
  en: {
    report: "The electricians haven't cleared the second floor. Our screed crew has been standing since seven, four people waiting.",
    answers: ["Probably until tomorrow at noon.", "The client hired the electricians.", "I don't know."],
    yes: "Yes, that's correct.",
  },
  de: {
    report: "Die Elektriker sind im zweiten Stock noch nicht fertig. Unsere Estrichkolonne steht seit sieben Uhr, vier Leute warten.",
    answers: ["Wahrscheinlich bis morgen Mittag.", "Die Elektriker hat der Bauherr beauftragt.", "Weiß ich nicht."],
    yes: "Ja, stimmt so.",
  },
}[LANG];
if (!SCRIPT) throw new Error(`--lang ${LANG}: only en or de`);

const AUDIO_DIR = join(".data", "bench-audio");

async function audioFor(text) {
  const file = join(AUDIO_DIR, `${createHash("sha1").update(`${LANG}:${text}`).digest("hex").slice(0, 16)}.mp3`);
  try {
    return await readFile(file);
  } catch {
    const res = await fetch(`${BASE}/api/tts?lang=${LANG}&text=${encodeURIComponent(text)}`);
    if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(AUDIO_DIR, { recursive: true });
    await writeFile(file, buf);
    return buf;
  }
}

async function post(path, init) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, init);
  const ms = performance.now() - t0;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status}: ${body.error ?? JSON.stringify(body)}`);
  return { ms, body, timing: res.headers.get("server-timing") ?? "" };
}

async function turn(conversationId, text) {
  if (!VOICE) {
    const r = await post("/api/agent/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, text_original: text, language: null }),
    });
    return { ...r, turn: r.body, heard: text };
  }
  const audio = await audioFor(text);
  const form = new FormData();
  form.append("audio", new Blob([audio], { type: "audio/mpeg" }), "utterance.mp3");
  form.append("conversation_id", conversationId);
  const r = await post("/api/voice", { method: "POST", body: form });
  return { ...r, turn: r.body.turn, heard: r.body.transcript?.text ?? "" };
}

const steps = (timing) =>
  timing
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [name, ...params] = s.split(";");
      const dur = params.find((p) => p.startsWith("dur="))?.slice(4);
      const desc = params.find((p) => p.startsWith("desc="))?.slice(5).replace(/"/g, "");
      return `${name}=${dur}${desc ? `(${desc})` : ""}`;
    })
    .join(" ");

const all = [];
for (let run = 1; run <= RUNS; run++) {
  const conv = await post("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ team_id: TEAM, kind: "call", language: null }),
  });
  console.log(`\n── run ${run}/${RUNS} (${LANG}, ${VOICE ? "voice" : "text"}) conversation ${conv.body.id}`);
  let text = SCRIPT.report;
  let answer = 0;
  for (let n = 1; n <= 6; n++) {
    const r = await turn(conv.body.id, text);
    all.push(r.ms);
    const t = r.turn;
    console.log(`turn ${n}: ${(r.ms / 1000).toFixed(2)} s  [${steps(r.timing)}]`);
    console.log(`  user:  ${r.heard}`);
    console.log(`  klara: ${t?.reply ?? "(ignored)"}  {intent=${t?.intent} source=${t?.source}}`);
    if (!t || t.ended) break;
    const confirmed = t.cases?.some((c) => c.status !== "entwurf") && !t.awaiting_confirm;
    if (confirmed) break;
    if (t.awaiting_confirm) text = SCRIPT.yes;
    else if (answer < SCRIPT.answers.length) text = SCRIPT.answers[answer++];
    else break;
  }
}

const sorted = [...all].sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
console.log(
  `\n${all.length} turns: median ${(pct(50) / 1000).toFixed(2)} s, slowest ${(sorted.at(-1) / 1000).toFixed(2)} s, fastest ${(sorted[0] / 1000).toFixed(2)} s`,
);
