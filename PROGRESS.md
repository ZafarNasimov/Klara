# Klara – Build progress

Handover file: read this first when you pick the build up (locally or in a new session).
Updated at every checkpoint. Spec: [SPEC.md](SPEC.md). UI rules: [CLAUDE.md](CLAUDE.md), [DESIGN.md](DESIGN.md), [PRODUCT.md](PRODUCT.md).

Last update: 2026-11-20 23:25 UTC · branch `claude/project-thread-jrqak8`

## Milestones (SPEC §11)

| | Milestone | Status |
|---|---|---|
| M0 | Skeleton: Next.js, store, schema, seed, role switcher, screen shells | ✅ done |
| M1 | Text pipeline: rules engine, `/api/agent/turn`, readback/confirm, text chat | ✅ done |
| M2 | Documents: templates, PDF + DOCX, sha256, versions, admin case view | ✅ done |
| M3 | Voice: call screen, STT/TTS (needs `OPENAI_API_KEY`) | 🟡 in progress |
| M4 | E-mail: composer, Postmark send, inbound reply analysis | ⬜ |
| M5 | Realtime, polish, fallbacks ("Antwort simulieren") | ⬜ |
| M6 | Eval set (`eval/utterances.json`, ≥30) and `eval/run.ts` | ⬜ |

### Done so far

- **Data:** store abstraction with two backends: in-memory (default, persisted to `.data/db.json`) and Supabase (`src/lib/db/`). Schema: `supabase/migrations/0001_init.sql` (18 tables). Seed: `src/lib/db/seed.ts` (SPEC §9: Muster Bau GmbH, Neubau Bürogebäude München, Team Estrich `ru`, Team Ausbau `pl`).
- **Demo clock:** project setting `demo_clock_offset_ms`; `/admin/demo` and `POST /api/demo/clock` (07:00 / 16:00), `POST /api/demo/reset`.
- **Rules engine** (`src/lib/rules/`, pure, unit-tested): sphere routing, recipient with authority (Architekt ohne Vollmacht → Bauherr), missing fields, deadlines in Werktage (Mon–Sat, Bavarian holidays), plan vs. actual, weather check.
- **Doc-type registry** (`src/lib/doctypes/`): fields, Klara's questions per language, readback fields.
- **Agent** (`src/lib/agent/`): extraction with Claude (`record_turn` tool) or the keyword reader `mock.ts` (no key, also the fallback when a live call fails); deterministic turn engine `turn.ts` (max 3 questions per case, readback, confirm, hang-up, corrections, sphere question); replies in the user's language (pre-written lines for de/en/ru/pl/tr/ro in `lines.ts`), German subtitle on every line.
- **Mobile chat** `/app/channel/[teamId]`: feed with day separators, case cards, readback as a confirm card ("Stimmt so" / "Ändern"), morning card and evening quantities in the user's language, composer that never hides messages.
- **Documents** (`src/lib/documents/`): German templates for behinderungsanzeige, behinderung_ende, mehrkostenanzeige, anordnung_bestaetigung, stellungnahme_zurueckweisung, verzug_nu, info_folgegewerk. DIN 5008 PDF (page 1 letter, page 2 internal audit page with transcript, weather, checks) and DOCX. Markdown → sha256; versions are immutable once sent. Routes: `/api/documents/[id]/pdf` (`?variant=letter`, `?download`), `/api/documents/[id]/docx`, `POST /api/cases/[id]/document`.
- **Weather evidence** (`src/lib/weather.ts`): Open-Meteo at the site and event hour, added on confirm of a Behinderungsanzeige; weather cases get "ungewöhnliche Witterung?" check. No data is invented when the lookup fails.
- **Office actions** (`src/lib/cases/actions.ts`, tested): `POST /api/cases/[id]/validate` (Bauleiter only, blocked by missing fields / red checks) and `POST /api/cases/[id]/return` ("Zurück zur Ergänzung": Klara asks the Polier in the chat in their language; the answer and a new confirm make version 2).
- **Correct by voice** (`reopenForCorrection` in `src/lib/cases/actions.ts`, `POST /api/cases/[id]/correct`): the Polier reopens a confirmed case; Klara asks "what should I correct?" in the team chat above the current facts (`state.confirm_intro = "correct"`). A change makes the next version and lifts the office approval; a plain "yes" keeps version and approval. Flag `correcting` until then.
- **Mobile case page** `/app/case/[id]` (`case-view.tsx`): next-step sentence, office question when returned, scaled page-1 letter thumbnail (opens the PDF), checks, facts, sticky "PDF öffnen" + state-dependent primary action. Case cards say when the office needs something.
- **Bautagesbericht** (`src/lib/reports/daily.ts`, template `templates/bautagesbericht.ts`): one case per team and day (reference `BTB-YYYYMMDD-<KOLONNE>`, outside KL numbering), compiled from the evening quantities (plan vs. actual table), the team's cases of the day (Besondere Vorkommnisse, Anordnungen), diary notes, site weather and names. Rebuilt after every evening quantity; missing Personal is asked in the chat (flag `collecting`), the yes writes the next version. DocBody has `form: "report"` plus `heading` / `table` / `signatures` blocks (PDF, DOCX, HTML preview). `POST /api/teams/[teamId]/daily-report {date?}` compiles on demand.
- **Voice, step 1 push-to-talk** (`src/lib/voice/`, `src/app/app/call/[callId]/call-view.tsx`): call screen with phases ready/ringing → listening → recording → processing → speaking, Klara greets by first name, hold-to-talk or tap-to-start/tap-to-send, live waveform from the mic, transcript with German subtitles, case cards, hang-up → "Gespräch beendet" with the cases and the protocol. `POST /api/voice` (multipart audio → OpenAI `gpt-4o-transcribe` → noise filter `segment.ts` → same agent turn), `GET /api/tts` (OpenAI `gpt-4o-mini-tts` MP3 stream; the browser voice when there is no key or it fails), `POST /api/conversations/[id]/end`. Typing works any time and is the only input without `OPENAI_API_KEY`. iOS: audio is unlocked inside the start tap. Verified with Playwright (typed call, and push-to-talk with a stubbed `/api/voice`); real OpenAI audio is untested.
- **Voice, step 2 hands-free** (`src/lib/voice/vad.ts`): default mode once the mic is open. Silero VAD (`@ricky0123/vad-web`, model v5) runs on the call's own mic stream and AudioContext (created in the start tap for iOS); each utterance goes as a 16 kHz WAV to the same `/api/voice`. Paused while Klara thinks and speaks, resumed 300 ms after she stops (no barge-in). Toggle "Freihändig" ⇄ "Push-to-Talk" keeps the conversation; in hands-free the centre button mutes. If the detector cannot load, the screen falls back to push-to-talk with a notice. Settings (silence before end of turn, minimum speech, threshold) come from `/admin/demo` (`POST /api/demo/vad`) via `GET /api/voice`. `npm install` copies the model, worklet and ONNX runtime to `public/vad/` (`scripts/copy-vad-assets.mjs`, gitignored output). Verified with Playwright and a fake mic playing synthetic speech (`--use-file-for-fake-audio-capture`): three spoken turns to a confirmed Behinderungsanzeige; `/api/voice` was stubbed because this session has no OpenAI key. Noise filter keeps one-word answers ("Ja", "2") on purpose, otherwise confirm by voice would break (SPEC says "under 2 words").
- **Tests:** 108 Vitest tests, incl. SPEC §10 scenarios (`src/lib/agent/turn.test.ts`) and office/Polier actions (`src/lib/cases/actions.test.ts`).

### M2 screens

- ✅ Bautagesbericht: report form PDF/DOCX/preview, compiled each evening, crew asked in the chat.
- ✅ `/app/case/[id]` mobile case page with "Per Sprache korrigieren" (critique notes in `.impeccable/critique/`).
- ✅ `/admin/case/[id]` office case page (`src/app/admin/case/[id]/case-detail.tsx`): header with status, deadline, **Validieren** (shows why it is blocked), **Zurück zur Ergänzung** dialog, **E-Mail vorbereiten** once validated (M4 composer still a shell); tabs Dokument (HTML letter preview from the same DocBody, version switch, SHA-256, PDF/Word download), Nachweise (transcript, weather), Verlauf, Hinweise; right rail with checks and facts. Critiqued (29/40) and the findings fixed.

### Live voice test (2026-11-20, 23:20 UTC, cloud session, real keys)

Path tested over HTTP (no browser): `POST /api/conversations` (kind call) → `POST /api/voice` (multipart audio + conversation_id) → `GET /api/tts`.

| Step | Result | Time |
|---|---|---|
| `GET /api/tts?lang=de` (gpt-4o-mini-tts) | 200, `audio/mpeg`, 79 KB MP3 | first byte 1.75 s, full 2.2 s |
| STT only (`/api/voice` without conversation_id) | transcript exact: "Die Elektriker sind im zweiten Stock noch nicht fertig. Vier Leute warten." | 1.15 s |
| Turn 1 (STT + live Claude) | `source: "live"` (no Testmodus). Behinderungsanzeige draft, 2.OG, Elektro, 4 idle staff, client sphere green; missing `start_at` (amber). Reply: "Seit wann genau? Bitte Datum und Uhrzeit." | **9.3 s** |
| Turn 2 (flite English voice saying German) | STT garbled ("Saeidhoiud morgenum siebenwehr"), a test-audio artifact, not an app bug. Klara asked again for the time, correctly. | **11.4 s** |

Findings:
1. **Latency misses the SPEC target (< 4 s).** STT is ~1.1 s, so ~8–10 s is the Claude turn (main model `KLARA_ANTHROPIC_MODEL`, default effort, `max_tokens` 4000 in `src/lib/agent/llm.ts`). Ideas: use the fast model and `effort: "low"` for call turns, smaller `max_tokens`, stream the reply and start TTS on the first sentence. Add per-step timing logs to `/api/voice` to confirm.
2. In cloud sessions `api.openai.com` was missing from the Default environment allowlist (proxy 403, "fetch failed"). Added 2026-11-20 23:20 UTC. Locally this does not apply.
3. Real phone test of hands-free VAD still to do (needs a browser + mic).

### Next steps, in order

1. Test real voice and Claude in a fresh cloud session (keys are in the environment now: `OPENAI_API_KEY`, `KLARA_ANTHROPIC_*`; `api.openai.com` is allowlisted). Measure latency per turn (SPEC: < 4 s), tune VAD defaults on a real phone. Then mark M3 done.
2. Photo button (SPEC §8: channel and call screen), photos as evidence on the case and the audit page. Not built yet.
3. M4–M6 per SPEC §11. In cloud sessions Node needs `NODE_USE_ENV_PROXY=1` to reach Supabase and the APIs.

Idea, not in SPEC (ask Zafar first): seed a few closed history cases KL-2026-0039..0041 so the board is not empty before the demo case.

## Run it locally

Node 22, npm.

```bash
npm install
cp .env.example .env.local     # every variable is optional
npm run dev                    # http://localhost:3000
npm test                       # Vitest
npm run typecheck && npm run lint
```

Screens: `/` entry, `/app` (Polier, mobile), `/app/channel/<teamId>`, `/admin` (office), `/admin/demo` (reset, clock). The role switcher in the header picks Polier / Bauleiter / Büro.

Without any keys Klara runs fully: memory store + keyword reader (only simple sentences, the SPEC §10 ones). A "Testmodus" note shows in the chat.

## Environment

See `.env.example` for all names. Never commit `.env*` files.

| Variable | Needed for | Notes |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase backend | `DATA_BACKEND` defaults to `supabase` when both are set |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser realtime | optional |
| `KLARA_ANTHROPIC_API_KEY`, `KLARA_ANTHROPIC_MODEL`, `KLARA_ANTHROPIC_MODEL_FAST` (optional `KLARA_ANTHROPIC_EFFORT`) | Live extraction + phrasing | Each falls back to the plain `ANTHROPIC_*` name. Claude Code cloud environments reserve `ANTHROPIC_*` (the key is not passed to the app, and `ANTHROPIC_MODEL` would change Claude Code's own model), so use the `KLARA_` names there; locally and on Vercel either works. `LLM_MODE` defaults to `live` when a key is set. The model names have no default (SPEC D10): set both. |
| `OPENAI_API_KEY` | M3 voice (speech-to-text, Klara's voice) | without it the call screen takes typed text and the browser speaks. Optional: `STT_MODEL`, `TTS_MODEL`, `TTS_VOICE`, `TTS_PROVIDER=browser` |
| `POSTMARK_*`, `DEMO_CLIENT_MAILBOX` | M4 e-mail | not used yet |
| `WEATHER_DISABLED=1` | skip Open-Meteo | tests set it |
| `DEMO_NOW` | fixed demo start instant | optional |

### Supabase setup

1. Run `supabase/migrations/0001_init.sql` once in the Supabase SQL editor (the service key cannot create tables).
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (and the `NEXT_PUBLIC_*` pair for realtime).
3. `npm run seed` loads the demo data (destroys existing rows).

Status (2026-11-20, checked from a separate session): all 18 tables exist and the seed is loaded.
- In the Claude Code cloud environment, Node `fetch` reaches Supabase only with `NODE_USE_ENV_PROXY=1` (the egress proxy). Locally you do not need it.
- `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` must be the project URL (`https://<ref>.supabase.co`), not the REST endpoint. The code now strips a trailing `/rest/v1/` anyway.

## Known issues and open decisions

- Live Claude path is untested until `KLARA_ANTHROPIC_API_KEY` (or `ANTHROPIC_API_KEY`) is set. Newer models reject forced `tool_choice`; `src/lib/agent/llm.ts` falls back to auto + instruction.
- Open-Meteo's free tier rate-limits shared cloud IPs ("Daily API request limit exceeded"); then no weather is attached.
- All letter texts are prototype drafts: **TODO legal review** (SPEC D8). Weather "unusual" thresholds are a heuristic.
- "E-Mail vorbereiten" lands in M4. Photo upload is not built yet.
- Next.js 16 here differs from older versions: read `node_modules/next/dist/docs/` first (AGENTS.md). With `cacheComponents`, async page work goes inside `<Suspense>`, GET handlers call `await connection()`, and run `npx next typegen` after adding routes (for `RouteContext` / `PageProps`).
- react-pdf: fixed absolute `View`s don't render (use fixed `Text`s); no `lineHeight` on `Page`; a unitless `lineHeight` needs `fontSize` in the same style. tsx cannot load react-pdf; test PDFs via Vitest.
- JS `\b` is ASCII-only; the keyword reader uses Unicode lookarounds.

## Working rules

- Build milestones in order; nothing outside SPEC without asking Zafar.
- Commit and push after each milestone and at checkpoints; update this file each time.
- UI work follows CLAUDE.md skill routing (frontend-design for new screens, `/impeccable critique` → fix → `/impeccable polish` after each screen; critique history is in `.impeccable/critique/`, gitignored).
