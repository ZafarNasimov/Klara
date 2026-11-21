// SPEC §10 eval: `npm run eval` (live model from .env.local) or `npm run eval -- --mock`
// (keyword reader, free). Each utterance is the first turn of a fresh team chat on
// a freshly seeded in-memory project; Supabase is never touched.
// Targets: ≥ 90 % doc_type, 100 % sphere. Exit code 1 below target.
// Options: --only <id-prefix>, --verbose.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

process.env.DATA_BACKEND = "memory";
process.env.MEMORY_PERSIST = "0";
const args = process.argv.slice(2);
if (args.includes("--mock")) process.env.LLM_MODE = "mock";
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const verbose = args.includes("--verbose");

type Expect = { doc_types: string[]; sphere?: string; missing_fields?: string[] };
type Utterance = { id: string; lang: string; team: "estrich" | "ausbau"; time?: string; text: string; expect: Expect };
type Row = { id: string; lang: string; doc_types: string[]; doc_ok: boolean; sphere: string | null; sphere_ok: boolean | null; missing: string[] | null; missing_ok: boolean | null; reply: string; ms: number; error?: string };

const HINDRANCE = new Set(["behinderungsanzeige", "verzug_nu"]);
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const pct = (ok: number, n: number) => (n ? `${Math.round((ok / n) * 1000) / 10} %` : "–");

async function main() {
  const { store } = await import("@/lib/db");
  const { createConversation, listCases, listEvents } = await import("@/lib/db/repo");
  const { buildSeed, IDS } = await import("@/lib/db/seed");
  const { berlinTime } = await import("@/lib/deadlines");
  const { runTurn } = await import("@/lib/agent/turn");
  const { llmMode } = await import("@/lib/agent/llm");

  const file = JSON.parse(readFileSync(new URL("./utterances.json", import.meta.url), "utf8")) as { utterances: Utterance[] };
  const items = file.utterances.filter((u) => !only || u.id.startsWith(only));
  const mode = llmMode();
  console.log(`Klara eval: ${items.length} utterances, model ${mode}\n`);

  const rows: Row[] = [];
  for (const u of items) {
    const [hh, mm] = (u.time ?? "09:30").split(":").map(Number);
    const now = berlinTime("2026-11-20", hh, mm);
    await store().reset(buildSeed(now));
    const team = u.team === "ausbau" ? IDS.teamAusbau : IDS.teamEstrich;
    const user = u.team === "ausbau" ? IDS.userPolierAusbau : IDS.userPolierEstrich;
    const conv = await createConversation({ team_id: team, user_id: user, kind: "chat" }, now);
    const t0 = Date.now();
    let reply = "";
    let error: string | undefined;
    try {
      reply = (await runTurn({ conversationId: conv.id, text: u.text, now: new Date(now.getTime() + 60_000) })).reply;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const ms = Date.now() - t0;
    const cases = (await listCases(IDS.project)).filter((c) => c.doc_type !== "bautagesbericht");
    const unsupported = (await listEvents({ projectId: IDS.project }))
      .filter((e) => e.kind === "unsupported_event" && typeof e.payload.doc_type === "string")
      .map((e) => e.payload.doc_type as string);
    const docTypes = [...new Set([...cases.map((c) => c.doc_type), ...unsupported])].sort();
    const expected = [...u.expect.doc_types].sort();
    const hindrance = cases.find((c) => HINDRANCE.has(c.doc_type)) ?? null;
    const primary = cases.find((c) => c.doc_type === expected.find((d) => HINDRANCE.has(d))) ?? cases.find((c) => c.doc_type === expected[0]) ?? null;
    const missing = primary ? [...primary.missing_fields].sort() : null;
    rows.push({
      id: u.id,
      lang: u.lang,
      doc_types: docTypes,
      doc_ok: !error && same(docTypes, expected),
      sphere: hindrance?.sphere ?? null,
      sphere_ok: u.expect.sphere === undefined ? null : hindrance?.sphere === u.expect.sphere,
      missing,
      missing_ok: u.expect.missing_fields === undefined ? null : !!missing && same(missing, [...u.expect.missing_fields].sort()),
      reply,
      ms,
      error,
    });
    const r = rows.at(-1)!;
    const mark = (ok: boolean | null) => (ok === null ? " " : ok ? "✓" : "✗");
    console.log(
      `${mark(r.doc_ok)} ${mark(r.sphere_ok)} ${mark(r.missing_ok)}  ${u.id.padEnd(18)} ${String(ms).padStart(5)} ms  ${docTypes.join(" + ") || "(kein Vorgang)"}${
        r.doc_ok ? "" : `   erwartet: ${expected.join(" + ") || "(kein Vorgang)"}`
      }${r.sphere_ok === false ? `   Sphäre ${r.sphere ?? "–"} statt ${u.expect.sphere}` : ""}${
        r.missing_ok === false ? `   fehlt ${JSON.stringify(missing)} statt ${JSON.stringify(u.expect.missing_fields)}` : ""
      }${error ? `   FEHLER ${error}` : ""}`,
    );
    if (verbose) console.log(`      ${u.text}\n      Klara: ${reply}`);
  }

  const count = (k: "doc_ok" | "sphere_ok" | "missing_ok") => {
    const scored = rows.filter((r) => r[k] !== null);
    return { ok: scored.filter((r) => r[k]).length, n: scored.length };
  };
  const doc = count("doc_ok");
  const sphere = count("sphere_ok");
  const missing = count("missing_ok");
  const langs = [...new Set(rows.map((r) => r.lang))];
  console.log(`\nDokumenttyp     ${pct(doc.ok, doc.n).padStart(7)}  (${doc.ok}/${doc.n}, Ziel ≥ 90 %)`);
  console.log(`Sphäre          ${pct(sphere.ok, sphere.n).padStart(7)}  (${sphere.ok}/${sphere.n}, Ziel 100 %)`);
  console.log(`Fehlende Angaben${pct(missing.ok, missing.n).padStart(7)}  (${missing.ok}/${missing.n}, informativ)`);
  console.log(
    `Je Sprache      ${langs.map((l) => `${l.toUpperCase()} ${rows.filter((r) => r.lang === l && r.doc_ok).length}/${rows.filter((r) => r.lang === l).length}`).join(", ")}`,
  );
  const times = rows.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`Antwortzeit     Median ${times[Math.floor(times.length / 2)]} ms, max ${times.at(-1)} ms`);

  mkdirSync(new URL("../.data/", import.meta.url), { recursive: true });
  writeFileSync(new URL(`../.data/eval-${mode}.json`, import.meta.url), JSON.stringify({ at: new Date().toISOString(), mode, rows }, null, 2));

  const pass = doc.ok / Math.max(doc.n, 1) >= 0.9 && sphere.ok === sphere.n;
  console.log(pass ? "\nZiel erreicht." : "\nZiel nicht erreicht.");
  process.exit(pass || only ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
