# Klara – Build progress

Handover file: read this first when you pick the build up (locally or in a new session).
Updated at every checkpoint. Spec: [SPEC.md](SPEC.md). UI rules: [CLAUDE.md](CLAUDE.md), [DESIGN.md](DESIGN.md), [PRODUCT.md](PRODUCT.md).

Last update: 2026-11-22 (EN/DE switch, views Baustelle/Bauleitung; interactive Baustellen map card) · on `main` (merged with the pitch updates)

## Milestones (SPEC §11)

| | Milestone | Status |
|---|---|---|
| M0 | Skeleton: Next.js, store, schema, seed, role switcher, screen shells | ✅ done |
| M1 | Text pipeline: rules engine, `/api/agent/turn`, readback/confirm, text chat | ✅ done |
| M2 | Documents: templates, PDF + DOCX, sha256, versions, admin case view | ✅ done |
| M3 | Voice: call screen, hands-free + push-to-talk, STT/TTS (needs `OPENAI_API_KEY`) | 🟡 built; latency cut to 2.6–4.3 s per voice turn (server side); laptop test passed (Zafar), real-phone test pending |
| M4 | E-mail: composer, send, inbound reply analysis | ✅ real round trip verified 2026-11-21 (Gmail): sent KL-2026-0043, Zafar's reply matched by the thread (In-Reply-To), classified rejection by the live model with the verbatim quote, "Übermittlung" green, Stellungnahme KL-2026-0044 drafted. Question and change-request replies still to try live |
| M5 | Realtime, polish, fallbacks ("Antwort simulieren") | ✅ done (open: screen to assign unmatched replies) |
| M6 | Eval set (`eval/utterances.json`, ≥30) and `eval/run.ts` | 🟡 eval done: 38 utterances, live model 100 % doc type, 100 % sphere (2026-11-21); 5 rehearsals on phone + projector pending (Zafar) |
| Should | Meeting notes (`/admin/meetings`), dashboards (`/admin`, `/admin/project/[id]`) | ✅ built by Vasily, merged 2026-11-21 (see the sections below) |

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
- **Turn timing** (`src/lib/timing.ts`): `/api/voice` and `/api/agent/turn` log one line per request (`[klara] timing POST /api/voice total=… stt=… db=…(23x) llm.record_turn=… render=… document=…`, plus model, effort and token counts) and send the same steps as a `Server-Timing` header (browser network panel). `db` is wall time with a store call in flight. `scripts/bench-call.mjs` replays the golden-path call turn by turn (text or real audio) and prints those steps.
- **Fewer database round trips per turn** (each is ~110 ms to Supabase from a laptop): `loadTurn` reads conversation → team, open cases, last turns, the conversation's cases side by side → project context (2 rounds instead of 3); `/api/voice` runs these reads while speech-to-text runs. During a turn case changes stay in memory and are written once per case (`flush` before anything reads cases from the store: letter, Bautagesbericht, open hindrance lookup); evidence and Klara's turn are written side by side; **events are written last** (they trigger the office screen's refetch, so the data must be stored first), +1 ms each to keep their order in "Verlauf". `generateDocument` takes the caller's project context and queued events.
- **E-mail loop (M4)** (`src/lib/mail/`):
  - `compose.ts`: subject per SPEC §8 (`Behinderungsanzeige gem. § 6 Abs. 1 VOB/B – BV … – Zeichen KL-…`; "gem." only for plain VOB/B bases), To/CC from `resolveRecipient()` like the letter, body suggested by the fast model (`suggest_email_body`, checked: starts with "Sehr geehrte Damen und Herren,", ends with "Mit freundlichen Grüßen", ≤ 110 words, no §) with a fixed German text as fallback (8 s timeout), signature from the Bauleiter.
  - `drafts.ts`: one unsent draft per case (`POST /api/mail/draft`, `GET`/`PATCH /api/mail/[id]`), `POST /api/mail/[id]/send`. Send is refused unless the case is `validiert`, the attached version is the validated latest one, the letter's addressee is under "An" (an e-mail must not go only to the architect without Vollmacht), and the sender is Bauleiter or Büro. `validate: true` = "Validieren und senden" for the Bauleiter (validates the version on screen; if validating rebuilds the letter, it stops and shows the new version). After sending: version `immutable` + `sent_at` + `delivery_status`, case `versendet`, "Übermittlung" check amber ("versendet, Zustellung nicht bestätigt" or "Testversand"), e-mail evidence, event `email_sent` (last).
  - `postmark.ts`: Postmark `POST /email` with the letter PDF (page 1, no audit page) and optional DOCX, `Metadata` with the case reference, optional `POSTMARK_REPLY_TO`. Without `POSTMARK_SERVER_TOKEN` nothing leaves the app: message id `sim-…`, the UI says "Testversand".
  - `inbound.ts` + `classify.ts`: `POST /api/email/inbound?token=…` (403 on a wrong token, which stops Postmark's retries; duplicates by Message-ID are ignored) and "Antwort simulieren" (`POST /api/demo/reply`, SPEC D5 text: "Wir weisen Ihre Behinderungsanzeige vom … zurück. Die Elektroarbeiten liegen im Zeitplan.") share `receiveReply`: match by our message id in `In-Reply-To`/`References` (substring, so `<id@mtasv.net>` works), else `KL-\d{4}-\d{4}` in subject/text, else stored unassigned; classify with `classify_reply` (main model) or German keywords; quotes only the client's own sentence (`verbatimQuote`). Rejection of a Behinderungsanzeige → `stellungnahme_zurueckweisung` (no team, so not in the Polier's channel; `parent_case_id`; facts reply_date, reply_quote, orig_reference, orig_date, evidence_bullets from start/area/cause/idle staff, transcript time, Bauzeitenplan due date of the causing trade, photos; weather only for weather hindrances) with letter v1 and the Hinweis "Eine Zurückweisung macht die Behinderungsanzeige nicht unwirksam. Vorschlag: Stellungnahme mit Nachweisen." Acceptance closes the case. The reply turns "Übermittlung" green ("Zugang belegt").
- **Photos (SPEC §8 "Foto")** (`src/lib/photos.ts`, `POST /api/photos`, `GET /api/photos/[id]`): camera button in the team channel (left of the text field) and on the call screen (next to the keyboard, and next to hang-up in typing-only mode). The phone shrinks the picture to ~1600 px JPEG (`src/lib/photo-client.ts`), the server keeps it in Supabase Storage (bucket `klara`, private) or `.data/files/` in memory mode (`src/lib/files.ts`) as `evidence` kind `photo` of: the case being talked about in that conversation, else the team's newest case of the day, else that day's Bautagesbericht (created if missing). Klara confirms in the Polier's language ("Foto abgelegt bei KL-…", line `photoSaved`). Shown as photo bubbles in the channel, as a grid under "Nachweise" on the office case page, as thumbnails (up to 6, JPEG/PNG) on the internal PDF page 2, and counted under "Fotodokumentation" in the Bautagesbericht (recompiled after each photo if it exists). Event `photo_added`.
- **Tests:** 134 Vitest tests (`src/lib/mail/mail.test.ts`: subject, draft + send gate, immutability, addressee rule, one-step approval, SPEC §10 scenario 7, duplicate webhook, matching fallbacks, webhook token, keyword classifier, verbatim quotes), incl. SPEC §10 scenarios (`src/lib/agent/turn.test.ts`) and office/Polier actions (`src/lib/cases/actions.test.ts`).

### M2 screens

- ✅ Bautagesbericht: report form PDF/DOCX/preview, compiled each evening, crew asked in the chat.
- ✅ `/app/case/[id]` mobile case page with "Per Sprache korrigieren" (critique notes in `.impeccable/critique/`).
- ✅ `/admin/case/[id]` office case page (`src/app/admin/case/[id]/case-detail.tsx`): header with status, deadline, **Validieren** (shows why it is blocked), **Zurück zur Ergänzung** dialog, **E-Mail vorbereiten** once validated (M4 composer still a shell); tabs Dokument (HTML letter preview from the same DocBody, version switch, SHA-256, PDF/Word download), Nachweise (transcript, weather), Verlauf, Hinweise; right rail with checks and facts. Critiqued (29/40) and the findings fixed.

### Dashboards (`/admin`, `/admin/project/[id]`; case board moved to `/admin/vorgaenge`)

- **Sites (pitch names):** A Neubau Bürogebäude Schwabing (`IDS.projectRiem`), B Wohnanlage Riem, Haus 2 (the demo site, `IDS.project`, golden path KL-…-0042), C Schule Pasing (`IDS.projectSchwabing`, BGB). Ids keep their first names; the teammates' history texts were adapted to the new sites. `dashboard-history.ts` (applied after `withDemoHistory` on reset / first memory start) sets the story: B Elektro 2.OG +1 before the call, +3 red after (the hindrance stops it for its expected duration), Estrich 2.OG green → +2 (pushed by the overlap); A on plan; C Fassade amber (no quantities, report missing); Plan/Ist Elektro 85/72, Sanitär 60/64, Trockenbau 45/40, Estrich 55/38.
- **Layout:** tab Überblick (4 KPIs, Munich map with pins, Handlungsbedarf top 3, heatmap, Plan/Ist; 58 words) and Details (Bauablauf, Tagesberichte, Dokumente, Anspruchsgrundlage, Aktivitäten). Map geometry is generated and static (`src/components/dashboard/munich-map.ts`).
- **Fits one screen:** at ≥ 760 px viewport height and ≥ 1200 px width (where the map card has two columns) the Überblick is a grid sized to the viewport (rows auto · auto · minmax(220px,1fr) · minmax(200px,1fr), gaps 16 px); verified without scrolling at 1440×900, 1470×956 and 1440×800, all sites and A/B/C. The map scales to its card (container query box), filtered site highlighted, others dimmed. Heatmap rows 28–40 px, Plan/Ist rows 24–32 px. Below 760 px the page scrolls.
- **Baustellen card** (`site-map.tsx`, 2026-11-22): map left (~55 %, fills the card: the city is cropped to the box, every site stays in view), site list right (badge in status colour, name, Stadtbezirk, status reason "Im Plan / ≤ 2 Tage Verzug / > 2 Tage Verzug / Behinderung offen / Keine Mengenmeldung", Offen · Verzug · Teams heute). Narrow card (< 44 rem, container query): list under the map. Status = worst trade with the heatmap's thresholds; same 3-item legend.
  - **Linked hover** (`site-hover.tsx`, shared state, event delegation on `data-site`): marker or row → marker ×1.15 with a status ring, its Stadtbezirk tinted, other markers 50 %, list row highlighted, the site's heatmap row and Handlungsbedarf items stay, the rest dim; works the other way round from heatmap and Handlungsbedarf. Plain district hover shows its name. Marker hover/focus opens a popover beside the pin (name, VOB/B or BGB · Bezirk, status, Offene Vorgänge, Verzugstage, Fehlende Berichte heute, last event with time, "Zur Baustelle"); Esc closes it. Click or Enter on a marker or row opens `/admin/project/[id]` (the old pin-click filter is gone; the filter bar still filters).
  - **Live:** a site whose numbers change ripples once (2 rings, ~1.2 s; a burst of refetches gives one ripple) and fades to its new colour; its changed list numbers flash blue-50 like the KPIs; an open Behinderungsanzeige keeps a slow ring; a status change is announced (aria-live). Reduced motion: colour only. Markers enter 80 ms apart. Filtered-out sites (site/team/trade) are dashed ghosts.
  - **Map:** offline SVG, 25 Stadtbezirke named (`DISTRICT_NAMES`, official order), Isar smoothed (Catmull-Rom) with a light gradient and an italic label, faint Mittlerer Ring. Labels "Riem · 1 offen" are placed by `chip-layout.ts` (urgent sites first, other side if needed, hidden if they would cover a pin; shown while hovered).
  - **Data:** `SiteSummary` gained `status_text`, `hindrance`, `contract`, `teams_today`, `missing_today`, `last_event`, `in_filter`; every `ActionItem` has `project_id`. Tests in `compute.test.ts` and `chip-layout.test.ts`.
  - **Speed:** `isPublicHoliday` is cached per day (date-holidays was ~90 % of the dashboard's time) and `dayOf` reuses one formatter: the dashboard computes in ~11 ms instead of ~230 ms, `/api/dashboard` answers in ~20 ms instead of ~700 ms locally.
  - **Verified** (local build, memory store): 1920×1080 and 1512×982 without empty areas; 1200×800, 1100 and 1000 px (stacked); EN; two windows: golden-path confirm → marker B red with one ripple within ~0.2 s, no reload; Scene 5 step ripples B; keyboard (Tab → popover, Esc, Enter); no console errors. 198 tests.
- **Demo day:** on a Sunday or holiday the seeds anchor to the next Werktag (`demoDay` in deadlines.ts), so the story reads the same on any reset day.
- **Rules:** a hindrance is active while its expected duration runs and until a Behinderung-Ende; a successor inherits a predecessor's real lateness by the overlap, only before it started; columns show running work; worst trade = most delay days.
- **One computation** (`src/lib/dashboard/compute.ts`, pure): the API (`/api/dashboard?site=&team=&trade=&days=`, `load.ts`) and pitch Scene 5 (`from-seed.ts`) use the same function. KPIs: Offene Vorgänge (unvollständig/bereit), Fehlende Tagesberichte heute (teams with planned work today, no `daily_report`), Anzeigen diese Woche (`document_version.sent_at` since Monday), Verzugstage im Risiko (sum of forecast delays per site × trade), Anspruchsgrundlage (Σ `estimate_eur`, vorläufig). Each with a daily history (sparkline) and change vs. last week. Forecast per schedule item: remaining qty ÷ actual per day from the last report → forecast end vs. planned end; successors inherit a late predecessor's delay. Heatmap: red = open Behinderungsanzeige of that trade or > 2 days, amber = 1–2 days or no quantities for 2 Werktage.
- **Live:** every widget refetches on each event (realtime-client). Verified: golden-path chat on the open dashboard → "Offene Vorgänge" +1 (blue-50 flash), Elektro × B and marker B amber → red within ~0.2 s of the confirm, no reload.
- **Live demo `/demo`** (Vasily, 2026-11-22): title → "Start live demo" (sets demo mode, opens Liam O'Connor's call, Team Fassade on Baustelle A, so Klara speaks English; `DEMO_LIVE_START` in `src/lib/demo.ts`) → the app → Besprechungen "Finish demo" → closing slide, one tab. `?scene=title|start|close`, keys 1–3, R, F. Scene 5's caption follows the DE/EN switch.
- **Pitch Scene 5** renders the real `DashboardBody` from `/api/dashboard/demo` (the reset demo computed on the server, no database); the step adds the call's KL-2026-0042 (same function), so the KPI and A × Elektro change on stage.
- **Supabase:** no migration (new rows only, `settings.site_code` in JSON); after a deploy, "Demo zurücksetzen" loads sites, history and dashboard data.

### Besprechungen / meeting notes (merged into `main` 2026-11-21)

Record a meeting → transcript → summary → only the evidenced letters → visible changes. Admin tab "Besprechungen" (`/admin/meetings`, `/admin/meetings/[id]`). Code: `src/lib/meetings/*`, `src/components/meetings/*`, `src/app/api/meetings/**`.

- **Storage:** the existing `meeting` table, no migration: `type`, `transcript` = `{segments: [{speaker, start_sec, text}]}`, `protocol` = header, items (the spec's `meeting_item`), changes, processing steps, mail draft. Audio chunks in `meetings/<id>/chunk-NNNNN` via `src/lib/files.ts` (Supabase Storage or `.data/files`).
- **Flow:** "Meeting starten" (title "Baubesprechung KW n", type, team for internal meetings, participants from the project, required consent) → recording (MediaRecorder, 5 s chunks uploaded in order, timer, level, pause, "Meeting beenden"; fallbacks "Audio hochladen" ≤ 4 MB and "Beispielaufnahme verwenden", also while recording) → processing in `after()` (`maxDuration` 300) with the four steps → detail.
- **Any language, German output:** STT without a forced language (`transcribeMeeting` in `src/lib/voice/openai.ts`: gpt-4o-transcribe-diarize, Whisper fallback, no `language`, no German prompt) → step "Übersetzung ins Deutsche" (`translate.ts`, language per segment, glossary) → extraction on the German text. Segments: speaker, start/end, language, text_original, text_de, confidence, notes. Floors (`floors.ts`): RU/UK "3-й этаж" → 2. OG (noted), PL/SR/HR/BS/TR/RO/UK-EN like German, US "first floor" → "EG/1. OG?" unsicher; a wrongly counted floor in the translation is corrected (`language.ts`). Confidence < 0.6 = "unsicher": never the only evidence for a template. Items: quote_de, quote_original, quote_language; tasks link the statement waiting for them. Detail: "Sprachen" badges, transcript toggle Deutsch/Original/Beide. Known limit: synthetic PL/HR voices were mis-recognised by the diarize model in a test (flagged unsicher, no letter); real speakers untested.
- **Pipeline** (`pipeline.ts`): Whisper `verbose_json` segments + `gpt-4o-transcribe-diarize` speaker turns (by overlap, "Sprecher A/B") → one Claude tool call (`record_meeting`: ≤ 5 summary bullets, items with a verbatim quote, speaker labels → names only with evidence) → `verifyItems` drops every item whose quote is not in the transcript → `applyItems`. Without a key (`LLM_MODE=mock`) or if Claude fails: rule extractor + notice; the sample falls back to its stored result + notice.
- **Templates** (`apply.ts`, same path as a call: `evaluateCase` → `createCase` → `generateDocument` → evidence kind `meeting` + event with `source: meeting:<ref>`): Anordnung → Bestätigung einer Anordnung; Mehrkosten → Ankündigung Mehrvergütung; Behinderung → updates the open Behinderungsanzeige of the same trade/area (`expected_duration`), else a draft; Mangel → `maengelanzeige`, Bedenken → `bedenken` (new meeting-only doc types, outside the call agent's list); Termin → moves the schedule item and its dependents (Werktage). Re-running never duplicates (same quote → "bereits vorhanden"). Trade from the sentence, else from the speaker's role.
- **Detail:** header, Zusammenfassung, Entscheidungen, Aufgaben (was/wer/bis/Gewerk), Erkannt & erstellt (quote, speaker, timestamp → transcript, case link), Nichts erkannt, Änderungen, Transkript, "Protokoll an Teilnehmer senden" (draft; sent only on confirm via `deliver()`).
- **Board:** meeting events in "Letzte Ereignisse"; Gewerke show "Verzug +N Arbeitstage · area (Besprechung)".
- **History meetings** (`meetings/history.ts`, 2026-11-22): MT-2026-0001 … 0005 on all three sites, in the speakers' languages (RU, TR, EN, RO + DE), each tied to the case history: B Bauherrenbesprechung (Deckendurchbrüche → KL-…-0032/0031 "bereits vorhanden"), A Baubesprechung (Sturm/Kran, Fenster-Zusage), C Bauherrenbesprechung (Fußbodenheizung → KL-…-0034), C Koordination Haustechnik und Maler (WC-Altinstallation → KL-…-0038), A Abstimmung Fenster Nordseite (KL-…-0036). Tasks due before the demo day are "erledigt". Recorded only: no case created, no date changed. On a live store they appear after "Demo zurücksetzen".
- **"Demo beenden"** (TEMPORARY, `components/demo/finish-demo.tsx`, `ALWAYS_SHOW`): on Besprechungen outside demo mode, the same dark-circle transition to `/pitch?scene=6b`; in demo mode (`/demo`) Vasily's "Finish demo" to `/demo?scene=close` as before.
- **Seed:** MT-2026-0006 (NU coordination, 2 tasks) and MT-2026-0007 (the sample, stored result) as history: no case, no date changed (notice says so); links resolve only when a case with that reference AND the expected doc type exists. New meetings continue at MT-2026-0008.
- **Pitch** Scene 4 "Meeting summaries" renders the real `MeetingDetail` (dense: summary, Erkannt & erstellt, Änderungen) from `src/components/pitch/meeting-fixture.ts` in the pitch's Riem names.
- **Verified:** 162 tests (quote check, dates, rule extractor, pipeline on the memory store with the golden-path call: KL-2026-0042 updated not duplicated, schedule +N, no Mängel from "keine Mängel"; offline fallbacks; seed). In Chrome on the memory store with live Claude/OpenAI: start → 32 s recording (fake mic, German speech) → end → processing 8–20 s → detail, speakers named; "Beispielaufnahme verwenden" via the UI (8 s); board shows the delay. No console errors.

### Pitch `/pitch` (branch `pitchflow`)

Full-screen pitch deck for the 3-minute presentation. Code in `src/components/pitch/**`, route `src/app/pitch/page.tsx`, assets in `public/pitch/**`.

- **Scenes** (`src/components/pitch/pitch-scenes.ts`, content spec of 2026-11-21, one story in `pitch-story.ts`: Baustelle B Wohnanlage Riem, team Estrich, client's electricians, 07:00, crew of 4, missing = duration + photo):
  | Key | Scene | Clicks inside |
  |---|---|---|
  | 1 | Title (dark): Ask Klara, 3 stat rows (7% · § 6 · 80%) + sources line; one press brings the rows 0.9 s apart | 1 |
  | 2 | The call (REPLAY), real dialogue timing (`call-timing.ts`): foreman message → 1.5 s → document fields + Klara typing dots → 1.5 s → her full reply; 1 s after the last reply the document moves left, then 5 capabilities. A press during a turn queues the next message (never skips the latency) | 4 (one per foreman message) |
  | 3 | The office (app mock; cursor visible; only the ringed `data-next` control or the next key advances): open Estrich, transcript, close, Clarify, Site manager, Send (3.2 waiting, amber), reply (3.3, next key or `S`, all green at once), Validate (3.4). `R` resets the scene | 8 |
  | 4 | More sources: meeting summary, email parsing, daily plan | 3 |
  | 5 | Portfolio: KPIs, plan vs actual by trade, sites/teams table, Elektro problem | 1 |
  | 6a | Ecosystem: strike-through, "An operating system…", inputs → Klara → outputs, people | 5 |
  | 6b | Close (dark): No missing reports. / No missed notices. / No lost money. / operating system / sign-off | 4 |
  Light scenes use shadcn (Badge, Button, Table, Chart) at presentation scale via `appScaleVars()` (re-bases `--spacing`, `--text-*`, `--radius` on the 1920×1080 grid; app mocks at 150 %).
- **Control:** →, Space, Enter, PageDown or click = next; ←, PageUp = back one beat (then the previous scene); number keys 1–6 jump to a scene; `R` resets the current scene. Input is ignored while a transition runs. The scene is kept in the URL (`?scene=6b`), so a reload stays put. Rehearsal switches: `?reveal=auto` (timed reveals), `?transition=fade` (crossfade instead of the circle wipe; also used with reduced motion). Cursor hidden on all scenes. `A` toggles AUTO pacing for Scene 2 (also `?pace=auto`); `?debug=1` shows the measured call gaps. Timing check: `npm run check:pitch` (app running, uses Chrome; asserts 1500 ± 100 ms per turn).
- **Klara robot** (`KlaraRobot.tsx`): 21st.dev Spline scene, served offline: `public/pitch/klara-robot.splinecode` + the runtime's `bevel.wasm` / `process.wasm` in `public/pitch/spline/` (the runtime fetches them from unpkg / cdn.spline.design otherwise). `@splinetool/runtime` is pinned to 2.0.211; **re-copy the two wasm files from `node_modules/@splinetool/runtime/build` when you bump it.** PNG fallback (`klara-robot.png`, transparent first frame) while loading, without WebGL, on errors or after 2 s. The scene opens on a head close-up and pulls back to the full robot in ~2.5 s (built into the scene). Head follows the pointer page-wide; **scripted gaze** via `glanceAt()`: she looks at the headline, each pain point as it appears, closing line 1, then the audience on the punchline (a real mouse move takes over).
- **Transitions** (`PitchFlow.tsx`): dark→light = text blur-out, visor glow, clip-path circle from the robot's head to the farthest window corner (1100 ms); light→dark = the light collapses into the head of the closing scene, which is mounted (inert, paused after its intro) under Scene 5.
- **Critique** 22/32 (dual-agent, snapshot `.impeccable/critique/…pitchflow-tsx.md`). Fixed: spotlight not rendering, off-screen wipe time and blank collapse start, white disc on the head, cursor on light scenes, hidden Scene 6 read out by screen readers, reload reset, plate < 11 px, label contrast (zinc-400 / neutral-300). Open: Back from Scene 2 replays the title robot's intro; the wipe origin ignores the head's turn.
- **Verified** (headless Chrome, offline, dev server): live robot 1.1–1.4 s after navigation, no request leaves localhost, PNG fallback with WebGL disabled (no layout shift), 1920×1080 and 1512×982 @2x, back navigation, key mashing, no console errors. Both wipes without dropped frames.
- **Before the pitch:** run it on the presentation laptop **plugged in** (on battery ≤ 20 % Chrome's Energy Saver caps animation at 30 fps), Chrome full-screen, from a production build (`npm run build && npm start`; in dev the first visit compiles the Spline chunk and can hit the 2 s PNG fallback). If the wipe stutters there, use `?transition=fade`.

### M4 screens

- `/admin/mail/[draftId]` composer (`composer.tsx`; `new?case=<id>` prepares the draft): mail header rows (Von = Bauleiter, An/CC as tokens with contact names and an amber mark for a contact without Vollmacht, Betreff), the suggested body, autosave; right rail = page 1 of the letter as paper (shared `LetterThumb`), file name, "Word-Datei mitsenden", "Prüfseite wird nicht mitgesendet". "Senden" / "Validieren und senden" stays focusable when blocked and names the reason; Strg+Enter sends. Sent e-mails open read-only.
- `/admin/case/[id]`: after sending "Wartet auf Antwort" (after 15 s a quiet "Antwort simulieren" link, SPEC §1 fallback); a reply appears as a card ("Antwort des Bauherrn: Zurückweisung", the client's sentence, Klara's Hinweis, "Stellungnahme öffnen KL-…"), announced with a toast. Follow-up letters show "Folgeschreiben zu KL-…" and Klara's Hinweis above the tabs. "E-Mail vorbereiten" shows from status `bereit`.
- `/admin/demo`: "Antwort simulieren" and the e-mail mode under "Betriebsart".
- `/impeccable critique` 28/40 (dual-agent; snapshot in `.impeccable/critique/`). Fixed all 5 priority issues (addressee rule, one-step approval, sender row and test-mode wording, inline field errors and uncommitted addresses, quiet fallback + announced reply) plus contrast and quotes; then `/impeccable polish` (selection and caret colour, primary hover kept above AA). Verified with Playwright on a production build: golden path → composer → wrong addressee blocked → validate and send → simulated rejection → Stellungnahme v1, no console errors.

### Call latency work (2026-11-21, local, real keys)

Measured on the laptop with `npm run dev` (port 3100), memory store with `DB_SIMULATED_LATENCY_MS=110` (same delay as Supabase from here, measured read-only: median 110 ms per call, first call ~900 ms), live Claude (`claude-sonnet-5-5`, effort low), OpenAI STT. Golden path (SPEC §1), 2 English + 1 German call per setting. Timings are from one machine and a few runs: directions, not exact numbers.

| Turn | DB wait before → after | Whole turn after (voice, incl. STT) |
|---|---|---|
| 1 report → question | 1.66–1.69 s → 0.93–0.95 s (reads now run during STT) | 3.8–4.2 s EN, 4.0 s DE |
| 2 answer → readback | 1.27–1.29 s → 0.70–0.72 s | 3.9–4.3 s EN (incl. 1.2–1.3 s phrasing call), 2.6 s DE |
| 3 yes → letter v1 | 2.56 s → 1.30–1.33 s | 2.9–3.5 s EN, 3.2 s DE |

Still in a turn: Claude `record_turn` 1.5–2.8 s, STT 0.5–1.3 s, the phrasing call 1.1–1.3 s (only readbacks in languages other than German), Klara's voice starts 0.6–1.2 s after the reply (`/api/tts`, independent of line length).

Why the cloud test showed 9–11 s (likely, not re-measured in the cloud): each turn made 21–41 store calls, mostly one after another, through the egress proxy; locally the Claude call alone was never more than ~3 s.

Tried and rejected (probe of 11 utterances, SPEC §10 + golden path, interleaved):
- Effort low vs default on `record_turn`: same speed (median 2.17 s vs 2.05 s). The effort setting did not cause the cloud latency.
- `claude-haiku-5-5` for `record_turn`: faster (median 1.25 s) but it returned **no event** for the golden-path sentence and blamed Elektro for an unreleased slab in the two-event case. Sonnet stays.
- Thinking off (`thinking: {type: "between_tools"}`): slower (median 3.1–3.2 s vs 2.1 s in two runs).
- `gpt-4o-mini-transcribe`: same speed as `gpt-4o-transcribe` (0.63 s vs 0.60 s median) and same transcripts on clean audio. Kept `gpt-4o-transcribe`.
- Splitting Klara's line into sentences for TTS: first audio comes after 0.6–1.2 s whatever the length, so no gain.

Open options (need a decision, see Next steps 1):
- (a) No phrasing call for en/ru readbacks (SPEC "latency tip"): `record_turn` would also return the free-text facts in the user's language and the readback uses the template. Saves ~1.2 s on the readback turn; changes the extraction prompt, so it needs the M6 eval first.
- (b) Paid: `claude-opus-5-5` with fast mode for `record_turn` (list price $8/$40 per MTok, about $0.02 per turn vs ~$0.005 now; prices from the API skill, not re-checked). Not measured.
- (c) Write the events after the response (`after()`): one round trip less (~0.1 s).

Earlier cloud test (2026-11-20, 23:20 UTC, HTTP only): STT exact and 1.15 s, TTS first byte 1.75 s, turns 9.3 s and 11.4 s. In cloud sessions `api.openai.com` had to be added to the environment allowlist.

### Next steps, in order

1. **Live checks of M3 and M4** (needs Zafar):
   - M3: real phone over HTTPS (`npm run build && npm start` plus a tunnel, e.g. `cloudflared tunnel --url http://localhost:3000`), compare the `[klara] timing` lines with "Call latency work", iOS start tap, VAD defaults for a loud site.
   - M4: the rejection round trip works live (see the M4 row). Still to try: a reply with a question ("Teilen Sie uns bitte mit …" → Ergänzende Angaben, Klara asks the Polier) and one with a change ("Abweichend … ist zusätzlich …" → Mehrkosten + Bestätigung); each needs its own sent letter.
   - Latency options still open (see "Call latency work"): (a) after M6, (b) paid.
2. **M5** (SPEC §11): realtime polish, demo page. (Done: "Verlauf" on the case page shows the whole chain of linked letters, e-mails included, via `caseChain` / `caseDetail` in `src/lib/cases/detail.ts`. Live channel chosen by the server (`/api/realtime/config`): Supabase Realtime only when the server writes to Supabase, else SSE; falls back to SSE if the Supabase channel cannot be joined; refetches after a reconnect and when the tab becomes visible again. SPEC §12 done criterion 1 checked with two browser screens (phone channel + office board, no reload): 27.9 s end to end on a local production build with live Claude and the 15 s "Antwort simulieren" wait; the board showed the confirmed case at once.) Other answers (SPEC §6.4 step 4) done: `request_info` → new doc type `ergaenzung` ("Ergänzende Angaben") with the client's questions, Klara asks the Polier in the team chat at once and the answer fills the letter (checked live: answer in Russian → German letter); `change_request` / `counter_instruction` → Ankündigung Mehrvergütung (prefilled from the e-mail, asks only start/planned start) + Bestätigung of the written instruction ("Bestätigung Ihrer Anordnung", "per E-Mail"); BGB contracts show the § 650b Abs. 2 30-day period with a countdown. Demo page plays in Zurückweisung, Rückfrage or Änderungswunsch. The doc type is now titled "Bestätigung einer Anordnung" (the letter subject still says "mündlichen" for verbal ones). Still open: unassigned replies are stored and logged but have no screen to assign them; a Postmark delivery webhook could turn "Übermittlung" green on delivery.
3. **M6**: eval done. `eval/utterances.json` has 38 labelled first turns (RU 8, PL 8, DE 10, TR 6, EN 5, RO 1): hindrance by the client's trade, own subcontractor no-show (→ `verzug_nu`), weather, verbal instruction (→ Anordnung + Mehrkosten), two events, unknown trade (sphere `unclear`), Wegfall, Bedenken (recognised, not built), evening quantities (→ `info_folgegewerk`), own crew, "all to plan", vague. `npm run eval` (live model, ~40 turns, well under 1 USD) or `npm run eval -- --mock` (keyword reader, free; 83 %, it is only the fallback); `--only <prefix>`, `--verbose`. Always a fresh in-memory project per utterance, never Supabase; results in `.data/eval-<mode>.json`; exit code 1 below target. Live run 2026-11-21: doc type 38/38, sphere 18/18, missing fields 3/3, median 2.4 s per turn. The first run missed "The drywall guys didn't show up today." (Klara asked what happened); fixed with a general prompt rule: a trade that did not show up, left early or works too slowly is a hindrance caused by that trade, code routes it. Still open: 5 full rehearsals on the real phone + projector (Zafar).
4. **Pitch:** critique + polish of Scenes 2–6a (running), then rehearse the whole deck on the presentation laptop (see "Pitch `/pitch`"). Then the app review (white, shadcn, anti-slop) for `/admin` and `/app`, on the memory store.

Idea, not in SPEC (ask Zafar first): seed a few closed history cases KL-2026-0039..0041 so the board is not empty before the demo case.

## Merge of Vasily's work into `main` (2026-11-21, 22:55, checked by Claude)

`main` = 64c69ca (`pitch-letter`, `dashboards` and the meeting notes on top of the three-site demo data). 24 commits, 61 files, +5,679 lines; nothing of the build branch was lost (its last commit f30395e is an ancestor).

- **What changed for everyone:**
  - `/admin` is now the portfolio dashboard "Alle Baustellen";
  - the case board moved to `/admin/vorgaenge` (nav: Übersicht, Vorgänge, Besprechungen, Demo);
  - `/admin/project/[id]` is the dashboard of one site;
  - "Besprechungen" is built: record or upload in any language, get a German protocol, and only the evidenced letters are drafted.
  - New doc types from meetings only: `maengelanzeige`, `bedenken`.
- **Data:**
  - `withDashboardHistory` (`src/lib/db/dashboard-history.ts`) runs after `withDemoHistory` on "Demo zurücksetzen" and on the memory store's first start. It adds daily quantities for every started item, check-in daily reports for 16 Werktage with gaps, and Elektro 2.OG quantities (900 m, 85 % pace).
  - `buildSeed` now includes the two meetings MT-2026-0006/0007, and the sites carry `settings.site_code` A/B/C.
- **Checked:**
  - typecheck clean (after `npx next typegen`, see below), lint clean apart from the old `mock.ts` warning, **189 tests** (35 new), production build;
  - in a browser on a fresh memory store: `/admin`, `/admin/vorgaenge`, `/admin/project/<Riem>`, `/admin/meetings` and a Schwabing case page, no console errors; the site switcher of the case board still works;
  - Supabase compatibility of the new reset rows: meetings use only the existing `meeting` columns (details in `transcript`/`protocol` JSON); daily-report statuses `eingereicht`/`entwurf` have no constraint; no migration needed;
  - `maxDuration = 300` on the meeting routes is fine on this Vercel plan (the realtime route has used 300 since the first deploy).
- **Open points (for Vasily / Zafar):**
  1. ~~Resolved (dashboard-v2): MT-2026-0007 now names no case numbers and changed nothing.~~ The seeded meeting MT-2026-0007 (yesterday) said it updated **KL-2026-0042** and created drafts **KL-2026-0043/0044**. After a reset none of these cases exist: KL-2026-0042 is created by the live demo call today, and the next letter (e.g. the Stellungnahme after "Antwort simulieren") becomes KL-2026-0043. The links don't resolve (by design, see the meeting section), but the texts can confuse on stage. Use references that don't collide, or present the meeting after the call.
  2. ~~Resolved (dashboard-v2): `/admin/meetings` follows the site chosen in the office.~~ It listed the meetings of the demo site only.
  3. After pulling new routes, run `npx next typegen` before `npx tsc` (`next build` does it by itself), otherwise `PageProps<"/admin/…">` fails with "does not satisfy the constraint 'AppRoutes'".
- **Update 23:55 (dashboard-v2, c6e3d4a):** open points 1 and 2 fixed by Vasily (seeded MT-2026-0007 names no cases; the meetings list follows the chosen site). Dashboard v2 (Überblick with KPIs, Munich map, Handlungsbedarf, heatmap, Plan und Ist; Details tab). **Sites renamed to the pitch story** (ids unchanged): A = "Wohnanlage Riem, Haus 2" (the demo site, formerly Neubau Bürogebäude München), B = "Neubau Bürogebäude Schwabing", C = "Schule Pasing"; older sections of this file still use the old names. Checked: typecheck, lint, 189 tests, build. The live database keeps the old names until "Demo zurücksetzen".
- **Deploy:** Vasily's pushes don't start Vercel builds (see Known issues); this PROGRESS commit by Zafar's account deploys `main`. On the live site, click "Demo zurücksetzen" once to load the dashboards' data and the meetings.

## Real e-mail through a mailbox (decided by Zafar, 2026-11-21)

Instead of Postmark, Klara can use a normal mailbox: `src/lib/mail/mailbox.ts` sends over SMTP (nodemailer, Klara sets the Message-ID, letter PDF attached) and reads answers over IMAP (imapflow + mailparser): unread mails of the last 7 days that reply to a Klara e-mail or carry "KL-…" in the subject go through `receiveReply` and are marked read. The case page calls `POST /api/email/poll` every 10 s while it shows "Wartet auf Antwort" ("Jetzt prüfen" link; "Antwort simulieren" after 60 s instead of 15 s). `delivery.ts` picks the mailbox first, then Postmark, else the test send. SPEC §13 lists Gmail/Outlook (OAuth) as out of scope; this uses an app password, and Zafar chose it.

- Mailbox: **musterbau.bauleitun@gmail.com** (no final "g"; Gmail app password in `MAIL_PASSWORD`, needs 2-Step Verification). The Bauherr contact gets `DEMO_CLIENT_MAILBOX` on "Demo zurücksetzen".
- Site password: `SITE_PASSWORD` → `src/proxy.ts` sends visitors without the cookie to `/login` (API: 401); `/api/email/inbound` stays open (own token).
- Live site (2026-11-21): `SITE_PASSWORD`, `DEMO_CLIENT_MAILBOX` and `MAIL_FROM_NAME` are set on Vercel and deployed; the login works, pages without it redirect, the API answers 401. Demo data reset there (Bauherr contact = the client mailbox, no cases).
- 2026-11-21: Gmail login works (the address had a typo in `.env.local`); `MAIL_USER` + `MAIL_PASSWORD` set on Vercel and deployed. Live site reports mail mode `smtp`; an inbox check from Vercel takes ~2 s and leaves non-Klara mail unread. Next: the real round trip (send → client replies → Klara analyses).

## EN/DE switch and two views (2026-11-22)

- **Switch:** "DE | EN" in the office top bar, on the start page and the login; on the phone inside the view menu (top right). Stored per browser (`klara_lang`), sets `<html lang>`, re-renders the screens in place (`LangProvider` in the root layout, `src/lib/i18n-provider.tsx`). German stays the default (CLAUDE.md).
- **How it works:** `$t("German text", vars)` for fixed UI text; German is the key, English in `src/lib/i18n-en.ts` (≈ 620 entries). `$tx(text)` for German the server builds (check reasons, deadline labels, timeline lines, Klara's hints, dashboard headlines and action lines): exact entry, else a pattern (`EN_PATTERNS`), else each part of an "A · B · C" line. Label maps in `labels.ts` and `docTitle`/`fieldLabel` translate on read (`localized()`), the server always reads German. Server components use `<T>`. Trade names show in English (Elektro → Electrical …).
- **Stays German on purpose:** letters and PDFs (`lang="de"` on the letter preview and thumbnail), what people said (transcripts, quotes, facts), meeting protocols, site names and addresses, browser tab titles.
- **New UI text:** wrap it in `$t()` (or `$tx()` for server text) and add the English to `i18n-en.ts`; `src/lib/i18n.test.ts` covers the patterns. An EN sweep (open every screen in EN, list visible German outside `lang="de"`) found nothing left apart from the intended German content.
- **Views:** the role switcher is now "Baustelle | Bauleitung" (EN "Site | Office"); "Büro" removed (same screens as the site manager; a stored "buero" opens "Bauleitung").
- 193 tests (4 new).

## Demo data: three sites, six languages (2026-11-21)

- **Sites** (`src/lib/db/seed.ts`, ids in `src/lib/ids.ts`): Neubau Bürogebäude München (VOB/B; Team Estrich RU, Team Ausbau PL; unchanged, the demo story and the tests), **Wohnanlage Riem, Haus B** (VOB/B; Team Rohbau TR Mehmet Yılmaz, Team Fassade EN Liam O'Connor; Fenster and Heizung hired by the client, Gerüstbau Schmid our NU) and **Sanierung Wohnhaus Schwabing** (BGB, Eigentümergemeinschaft; Team Abbruch DE Klaus Becker, Team Innenausbau RO Andrei Popescu; Elektro hired by the client, Gruber Haustechnik and Demir Malerbetrieb our NUs). Schedules and daily quantities relative to today; all Bauherr e-mails go to `DEMO_CLIENT_MAILBOX` when set. New trade aliases: Gerüstbau, Fassade, Rohbau, Abbruch, Innenausbau (six languages).
- **History** (`src/lib/db/demo-history.ts`, `withDemoHistory`): KL-2026-0031..0041 over the last three weeks, built with the real templates: Mehrkosten + Anordnung (RU, accepted), Abhilfeaufforderung to Nowak (PL), storm hindrance (TR, weather), window hindrance (EN) → rejection → Stellungnahme → Wegfall to validate, Mehrkosten BGB (DE, accepted), Elektro hindrance (RO) → question → Ergänzende Angaben to validate, Meldung zur Prüfung (DE). Transcripts in the team's language with German, sent e-mails, replies, timeline events, six Bautagesberichte. Loaded by "Demo zurücksetzen" and the memory store's first start, not by the test seed. The live demo's first case stays **KL-2026-0042**.
- **Screens:** the office tree lists every site (switch by click; top bar follows; `useProjectId` in `src/lib/project-choice.ts`, kept per browser); a case page uses its own site's data and switches the top bar to it; the Polier start page lists all sites with their team channels (`GET /api/projects`). Demo clock and hands-free settings apply to every site.
- Validated internal reports (Bautagesbericht, Meldung) count as done: "geprüft am …", not under "Fristen heute" or "offen" (`isOpenCase`).
- Checked with the live model: EN scaffolders → Abhilfeaufforderung to Gerüstbau Schmid; TR heating → Behinderungsanzeige (client); RO electricians → Behinderungsanzeige (client); DE painters → Abhilfeaufforderung to Demir; each reply in the team's language. 154 tests (4 new: demo data, every case page and PDF of it).
- **Live site:** the new data appears after "Demo zurücksetzen" on `/admin/demo` (this deletes the test cases there).

## Unclear reports: one complaint, one case (decided by Zafar, 2026-11-21)

Found in a live Russian call (slang, a "meteorite", broken site toilets, 7 idle): Klara asked the same "what happened and where?" three times, kept only a diary line and dropped two reports; the office saw no case. Changed:

- **Prompt:** confidence means "did such an event happen", not "is it plausible or complete"; "we cannot work", "N people are waiting" is a hindrance whatever the cause, slang and mixed languages included.
- **Every complaint becomes one case** (`src/lib/agent/turn.ts`): a concrete report opens its case from 30 % confidence (`OPEN_THRESHOLD`); below 60 % the "Erkennung" check stays amber ("unsicher erkannt – bitte prüfen"). An unclear message gets one clarifying question; the second unclear one opens the **default case** `meldung` ("Meldung zur Prüfung", internal, never sent; fields: report, area, impact) with everything said, and Klara goes on with its questions, readback and confirm. When the report becomes clear later, the same case (same KL number) turns into the right letter (`_note_de` keeps the first words). Own crew / own equipment (SPEC §5.2: no letter) is now also this internal case, with the risk note and flag `internal_risk`, instead of a diary line only.
- **Nothing is lost at the end:** hang-up or "that's all" with an unclear report still open saves it as the default case; every unconfirmed case gets the conversation as Gesprächsprotokoll. A second cause in the same report is added to the first ("A; B") instead of replacing it.
- **Transcript for the site manager on every case** (`caseDetail().live_transcript`): "Nachweise" shows the conversation as it stands until a confirmed Gesprächsprotokoll exists; each line in the original language (tagged RU/PL/…) with the German translation under it.
- `KLARA_LOG_EXTRACT=1` logs the model's decision per turn (off by default; contains what the user said).
- Checked: the Russian call now gives one Behinderungsanzeige (both causes, 7 idle) and ends with the readback; a truly unclear Russian call gives "Meldung zur Prüfung" (asks where and the impact, readback, "Да" → Bereit). Eval 42 items (4 new: slang meteorite, toilets RU/DE, Polish slang no-show; own crew now expects `meldung`): live 42/42 doc type, 20/20 sphere. 145 tests.

## Branches

- **`main` is the main branch** (decided by Zafar, 2026-11-21). On 2026-11-21 it was fast-forwarded to `0940df7`, which holds all work so far: M0–M6, the mailbox e-mail loop, the photo button and the merged pitch deck. No history was rewritten. Since 2026-11-21, 22:55 it also holds Vasily's dashboards, meeting notes and pitch letter scenes (see "Merge of Vasily's work").
- `claude/project-thread-jrqak8`: the build branch these sessions worked on; identical to `main` at `0940df7`.
- `pitchflow`: the pitch deck branch; fully merged into `main`. Before continuing there, merge `main` into it first.
- `claude/project-thread-n3tjiq`: stale; its only extra commit is a PROGRESS note of the first cloud voice test (9–11 s per turn), summarised under "Call latency work".

## Deployment (Vercel)

- Live: **https://klara-liard.vercel.app** (also klara-zafars-projects-3fafacbe.vercel.app), project `klara` in team "Zafar's projects", functions in `fra1` (`vercel.json`, next to Supabase). Deployed 2026-11-21 with `vercel deploy --prod`; `.vercelignore` keeps `.env*` and local data out of the upload.
- Env vars set on Vercel (production): DATA_BACKEND=supabase, the Supabase four + bucket, KLARA_ANTHROPIC_* (key, models, effort low), OPENAI_API_KEY, STT/TTS settings. Smoke test: pages, `/api/project` (supabase, live), `/api/voice`, `/vad/*` all 200.
- The project is connected to the GitHub repo: **every push to `main` deploys production automatically**; pushes to other branches create preview deployments (protected by Vercel login). `vercel deploy --prod` still works for a deploy from a local tree.
- **Site password:** `SITE_PASSWORD` is set on Vercel; every page (including `/pitch`) and API route needs the login at `/login` (cookie for 30 days), except `/api/email/inbound` (token-protected).
- Postmark with this deployment: set `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM`, `POSTMARK_REPLY_TO`, `POSTMARK_INBOUND_TOKEN`, `DEMO_CLIENT_MAILBOX` in Vercel (Settings → Environment Variables), redeploy, set the inbound webhook to `https://klara-liard.vercel.app/api/email/inbound?token=<POSTMARK_INBOUND_TOKEN>`, then "Demo zurücksetzen" on `/admin/demo` so the Bauherr contact gets the mailbox. Until Postmark approves the account, the client mailbox must be on the sender's domain.
- Phone test (M3) can use the same URL (HTTPS, no tunnel needed).

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

- `npm install` also copies the voice-detector files to `public/vad/` (postinstall). If hands-free says it cannot start, run `node scripts/copy-vad-assets.mjs`.
- The microphone needs a secure page: `http://localhost` works; for a phone on your network use `next dev --experimental-https` or a tunnel.
- Memory mode keeps data in `.data/db.json` (`MEMORY_PERSIST=1`). `/admin/demo` → "Demo zurücksetzen" reloads the seed.
- Try the e-mail loop without a mail server: confirm a Behinderungsanzeige (call or chat), open it under `/admin` as Bauleiter, "E-Mail vorbereiten" → "Validieren und senden"; on the case page wait 15 s → "Antwort simulieren" (or `/admin/demo`) → "Stellungnahme öffnen". Without `POSTMARK_SERVER_TOKEN` everything is a test send.
- Measure call latency without touching Supabase:
  ```bash
  # PowerShell: $env:DATA_BACKEND='memory'; $env:MEMORY_PERSIST='0'; $env:DB_SIMULATED_LATENCY_MS='110'; npx next dev -p 3100
  DATA_BACKEND=memory MEMORY_PERSIST=0 DB_SIMULATED_LATENCY_MS=110 npx next dev -p 3100
  node scripts/bench-call.mjs --base http://localhost:3100 --lang en --runs 2 --voice   # --lang de; drop --voice for text turns
  ```
  Live Claude and OpenAI calls are billed (a run of 2 calls costs a few cents). Recordings are cached in `.data/bench-audio/`. `TIMING_DB_DETAIL=1` splits the `db` step per table.

## Environment

See `.env.example` for all names. Never commit `.env*` files.

| Variable | Needed for | Notes |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase backend | `DATA_BACKEND` defaults to `supabase` when both are set |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser realtime | optional |
| `KLARA_ANTHROPIC_API_KEY`, `KLARA_ANTHROPIC_MODEL`, `KLARA_ANTHROPIC_MODEL_FAST` (optional `KLARA_ANTHROPIC_EFFORT`) | Live extraction + phrasing | Each falls back to the plain `ANTHROPIC_*` name. Claude Code cloud environments reserve `ANTHROPIC_*` (the key is not passed to the app, and `ANTHROPIC_MODEL` would change Claude Code's own model), so use the `KLARA_` names there; locally and on Vercel either works. `LLM_MODE` defaults to `live` when a key is set. The model names have no default (SPEC D10): set both. |
| `OPENAI_API_KEY` | M3 voice (speech-to-text, Klara's voice) | without it the call screen takes typed text and the browser speaks. Optional: `STT_MODEL`, `TTS_MODEL`, `TTS_VOICE`, `TTS_PROVIDER=browser` |
| `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM`, `POSTMARK_REPLY_TO`, `POSTMARK_INBOUND_TOKEN`, `DEMO_CLIENT_MAILBOX` | M4 e-mail | without the token every send is a test send (nothing leaves the app). `POSTMARK_REPLY_TO` = the Postmark inbound address, so the client's answer reaches `/api/email/inbound?token=…`. The seed gives the Bauherr contact the `DEMO_CLIENT_MAILBOX` address, so the teammate's mailbox receives the demo letter. Postmark domain/DNS must be verified before the event (SPEC D4) |
| `DATA_BACKEND` (`memory` / `supabase`), `MEMORY_PERSIST` | data store | default: Supabase when its URL and key are set, else memory |
| `NODE_USE_ENV_PROXY=1` | **Claude Code cloud only** | Node `fetch` there must go through the egress proxy (Supabase, OpenAI, Anthropic). Not needed locally or on Vercel |
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

- Meetings: `maxDuration = 300` on `/api/meetings/[id]/end` and `/sample`; check the Vercel plan allows it before merging. Each processed recording costs two transcription calls (Whisper + diarize) and one Claude call. Uploads go in 5 s chunks (Vercel body limit); "Audio hochladen" takes ≤ 4 MB. Speakers are only named with evidence; otherwise "Sprecher A/B".
- Keys were checked on 2026-11-20 from a separate cloud session (Supabase with 2 teams, Anthropic, OpenAI). The live voice path works over HTTP; after the 2026-11-21 latency work a voice turn takes 2.6–4.3 s on the server locally (see "Call latency work"). The browser call screen has not run with real keys yet. Newer models reject forced `tool_choice`; `src/lib/agent/llm.ts` falls back to auto + instruction.
- Hands-free was verified only with a simulated mic (Playwright `--use-file-for-fake-audio-capture` with synthetic speech) and a stubbed `/api/voice`.
- Open-Meteo's free tier rate-limits shared cloud IPs ("Daily API request limit exceeded"); then no weather is attached.
- All letter texts are prototype drafts: **TODO legal review** (SPEC D8). Weather "unusual" thresholds are a heuristic.
- **Dev server reload loop:** twice in this session `next dev` (Turbopack) reloaded every page endlessly ("HMR hash mismatch" in the HMR socket, "✓ Compiled in 2ms" in the log) after many file edits. A restart helped once, not the second time; `npm run build && npm start` was fine. Not diagnosed (maybe OneDrive touching synced files in this folder). If pages keep reloading, restart `npm run dev` or use the production server.
- The rebuttal letter lists weather only for weather hindrances (next to a trade's hindrance it would invite "it was the weather"). Decision taken in the M4 critique; tell Zafar if he wants it always.
- **Translated pages (fixed 2026-11-21):** Chrome's "Translate this page" (offered on this German UI) replaces text nodes; React then threw `NotFoundError: insertBefore` and the case page broke right after sending and again when the reply arrived (real-mailbox mode updates the waiting panel every 10 s). Fixed in the panel (changing text in its own elements) and app-wide with `src/components/dom-translation-guard.tsx` (React issue #11538 workaround). Rule: in UI that updates while visible, keep conditional text inside elements, not as loose text next to other nodes.
- **Vercel and teammates' pushes:** pushes to `main` by Vasily created production deployments that never started (status UNKNOWN, no build log; likely because the commit author is not a member of the Vercel team). Add Vasily to the Vercel team or approve those deployments in the dashboard; otherwise their changes go live only with the next deploy by Zafar.
- Next.js 16 here differs from older versions: read `node_modules/next/dist/docs/` first (AGENTS.md). With `cacheComponents`, async page work goes inside `<Suspense>`, GET handlers call `await connection()`, and run `npx next typegen` after adding routes (for `RouteContext` / `PageProps`).
- react-pdf: fixed absolute `View`s don't render (use fixed `Text`s); no `lineHeight` on `Page`; a unitless `lineHeight` needs `fontSize` in the same style. tsx cannot load react-pdf; test PDFs via Vitest.
- JS `\b` is ASCII-only; the keyword reader uses Unicode lookarounds.
- CSS modules do not work in this project: `next.config.ts` sends every `*.css` through the Tailwind loader as global CSS, so `styles.x` is undefined. Use Tailwind classes or inline styles.
- Pitch: the Spline runtime logs `updating from 114 to 136` (warning) on every robot load because the 21st.dev scene file is an older format. Only a re-export from the Spline editor removes it. `npm i @splinetool/react-spline` without exact versions failed with a bogus ERESOLVE (`react@undefined`); installing with exact versions works.

## Working rules

- Build milestones in order; nothing outside SPEC without asking Zafar.
- Commit and push after each milestone and at checkpoints; update this file each time.
- UI work follows CLAUDE.md skill routing (frontend-design for new screens, `/impeccable critique` → fix → `/impeccable polish` after each screen; critique history is in `.impeccable/critique/`, gitignored).
