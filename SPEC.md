# Klara — Build Spec for Claude Code

> **How to use this file:** Put it in the repo root as `SPEC.md` and tell Claude Code:
> *"Read SPEC.md fully. Then propose a short plan for Milestone 0 and 1 and start building. Follow the milestones in order. Do not add features outside the spec without asking. Commit after each milestone."*

---

## 0. Product in one paragraph

**Klara** is an AI assistant for German construction site managers (Bauleiter) and foremen (Polier). A worker calls Klara in any language and reports a site event ("electricians haven't cleared 2.OG, screed is blocked, 4 people waiting"). Klara recognizes the legal situation (e.g. a hindrance under § 6 VOB/B), asks only for missing facts, checks whose fault it is (sphere), and produces a **complete German document** (e.g. *Behinderungsanzeige*). The site manager validates it in an admin panel, sends it by email (subject, attachment and suggested body are pre-filled), and when the client replies, Klara analyzes the reply and **drafts the next letter**. Klara also writes the daily report (*Bautagesbericht*) and meeting minutes.

**Hard rules**
- Human in the loop: **nothing leaves the system without an explicit "Freigeben" by a human.**
- **Sent documents are immutable.** A reply never edits a sent document; it creates a *new* linked document (reply/supplement/follow-up).
- The LLM never invents facts. Templates are fixed German text; the LLM only fills fields from facts the user stated.
- No legal advice wording. Use "Hinweis: …" phrasing ("Hinweis: vermutlich eigene Sphäre – bitte prüfen"), never verdicts ("Kein Anspruch").
- All user-facing UI in **German**. Klara speaks the **user's language**. All documents are **German**.

---

## 1. The demo (golden path) — build this first, make it flawless

Total pitch: 3 min. The demo must run end-to-end in **≤ 2:30** with no reloads.

| t | What happens on stage | What the system does |
|---|---|---|
| 0:00–0:15 | Presenter: money hook (1 sentence) | — |
| 0:15 | Presenter opens Klara on phone, taps **"Klara anrufen"**, speaks English: *"The electricians haven't cleared the second floor. Our screed crew has been standing since seven, four people waiting."* | STT → agent turn → classify `behinderungsanzeige`, sphere `client` (Elektro is hired by client per project data) |
| 0:35 | Klara asks (English TTS) 1–2 questions: *"How long do you expect this to last?"* | Only missing required fields are asked |
| 0:50 | Klara reads back facts, presenter says "yes" | Case created, German document v1 generated (PDF + DOCX), admin panel updates in realtime |
| 1:00 | Big screen: admin panel. Case card with traffic light: **green** fields, **yellow** "Adressat: Bauherr (Architekt ohne Vollmacht)", deadline badge "unverzüglich – heute", evidence (timestamp, weather, transcript) | — |
| 1:15 | Admin clicks **Validieren → E-Mail vorbereiten**. Recipient, CC, subject, attachment pre-filled; body suggested by AI; admin edits one word, clicks **Senden** | Email sent with PDF attached; delivery logged |
| 1:40 | Teammate (as client) replies from second mailbox: *"Wir weisen Ihre Behinderungsanzeige zurück. Die Elektroarbeiten liegen im Zeitplan."* | Inbound webhook → matched to case by reference → reply classified `rejection` |
| 1:55 | Admin panel: new event "Antwort des Bauherrn: Zurückweisung". Klara's suggestion: *"Hinweis: Eine Zurückweisung macht die Anzeige nicht unwirksam. Vorschlag: Stellungnahme mit Nachweisen."* Draft reply with evidence list ready | Draft `stellungnahme_zurueckweisung` v1 linked to original |
| 2:15 | Admin clicks Freigeben & Senden. Timeline shows full chain | — |
| 2:30–3:00 | Closing line | — |

**Fallbacks (must exist):** text input instead of voice; "Antwort simulieren" button if inbound email doesn't arrive in 15 s; seeded demo state reset button (`/admin/demo` → "Demo zurücksetzen").

---

## 2. Tech stack (defaults — change only if the team decides otherwise)

- **Next.js (App Router, TypeScript)**, deployed on **Vercel** (HTTPS needed for mic).
- **Supabase**: Postgres, Storage (audio, PDFs, photos), Realtime (admin live updates). No real auth for the hackathon: a **role switcher** in the header (Polier / Bauleiter / Büro).
- **LLM:** Anthropic Claude via `@anthropic-ai/sdk`, structured output via **forced tool use** (`tool_choice: {type: "tool", name: ...}`). Model ID from env `ANTHROPIC_MODEL` — **do not hardcode; verify the model ID in Anthropic docs**. Set `max_tokens` generously (≥ 2000) and check `stop_reason`.
- **STT:** OpenAI transcription API, model from env `STT_MODEL`. Pass language hint if known; return detected language.
- **TTS:** OpenAI TTS or ElevenLabs, from env `TTS_PROVIDER`. Must support RU, PL, TR, RO, DE.
- **Voice UX:** push-to-talk inside an in-app "call" screen (not a real phone call). Realtime voice is a *Could*.
- **Email:** Postmark (outbound + inbound webhook) — one provider for both. Env: `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM`, inbound webhook → `/api/email/inbound`. **Domain/DNS verification must be done before the hackathon.**
- **PDF:** `@react-pdf/renderer` (server-side). **DOCX:** `docx` npm package. Both rendered from the same document model.
- **Working days/holidays:** `date-holidays` with `DE`, state `BY`.
- **Weather:** Open-Meteo (no key) by project lat/lng.
- UI: Tailwind + shadcn/ui. Light, calm, corporate (Teams-like). Large touch targets on mobile.

`.env.example` must list every variable.

---

## 3. Architecture

```
Mobile (PWA, Polier)                     Desktop (Admin, Bauleiter/Büro)
  /app/channel/[teamId]                    /admin, /admin/case/[id], /admin/mail/[draftId]
  /app/call/[callId]                         ▲ Supabase Realtime
        │ audio/text                          │
        ▼                                     │
  /api/voice  ──► STT ──► /api/agent/turn ──► Claude (tool use) ──► facts/missing/next_question
                                   │
                                   ▼
                        Rules engine (pure TS, no LLM)
                 sphere · recipient · traffic light · deadlines
                                   │
                                   ▼
                    Document builder (fixed German templates)
                       → document_version (md + PDF + DOCX + sha256)
                                   │
         /api/case/[id]/validate → /api/mail/draft → /api/mail/send (Postmark)
                                   │
         /api/email/inbound ◄── Postmark inbound webhook
                → match case → classify reply (Claude) → propose next document
```

**Principle:** the LLM extracts and classifies; **deterministic code decides** recipient, sphere routing, deadlines, completeness and traffic lights. This is both more reliable and our answer to "who is liable if the AI is wrong".

---

## 4. Data model (Supabase)

Keep it lean; use `jsonb` where structure is still moving.

```sql
company(id, name, logo_url, address)
project(id, company_id, name, address, lat, lng, contract_type text check in ('VOB_B','BGB'),
        contract_no, contract_date, settings jsonb)        -- settings: fiktive_abnahme_excluded, invoice_deadlines, hourly_rates…
contact(id, project_id, name, organisation, role text check in ('bauherr','architekt','nu','intern'),
        email, has_authority bool)
trade(id, project_id, name, contracted_by text check in ('client','us'), contact_id, team_id null)
team(id, project_id, name, lead_user_id)
app_user(id, name, role text check in ('polier','bauleiter','buero','gf'), language text, email)
schedule_item(id, project_id, trade_id, activity, area, start_date, end_date,
              planned_qty, unit, planned_per_day, depends_on uuid[])
progress_entry(id, schedule_item_id, date, actual_qty, note)

conversation(id, team_id, user_id, kind text check in ('call','chat','meeting'),
             language, status, started_at, ended_at)
turn(id, conversation_id, role text check in ('user','klara'), text_original, text_de,
     audio_url, created_at)

"case"(id, project_id, team_id, conversation_id, doc_type, status, sphere, facts jsonb,
       missing_fields text[], checks jsonb, deadline_at, deadline_rule text,
       parent_case_id null, reference text unique,            -- e.g. KL-2026-0042
       created_at)
document_version(id, case_id, version int, body jsonb, body_md, pdf_url, docx_url, sha256,
                 addressee_contact_id, tone text, created_at,
                 validated_by, validated_at, sent_at, delivery_status, immutable bool default false)
evidence(id, case_id, kind text check in ('photo','weather','transcript','diary','email','meeting'),
         ref, data jsonb, created_at)

email_out(id, case_id, document_version_id, to text[], cc text[], subject, body,
          message_id, sent_at, status)
email_in(id, project_id, case_id null, from_addr, subject, body_text, in_reply_to, message_id,
         received_at, classification jsonb, raw jsonb)

daily_report(id, team_id, date, data jsonb, status, missing_fields text[])
meeting(id, project_id, type, audio_url, transcript jsonb, protocol jsonb, created_at)
event(id, case_id null, project_id, kind, payload jsonb, created_at)   -- timeline/audit log
```

**Statuses**
- `case.status`: `entwurf` → `unvollstaendig` → `bereit` → `validiert` → `versendet` → (`beantwortet` | `abgeschlossen`)
- Once `versendet`, set `document_version.immutable = true`. Any change = new case with `parent_case_id`.

---

## 5. Document type registry (config-driven)

All document types are defined in **one TypeScript registry** (`lib/doctypes/*.ts`). Adding a type = adding a config + template; no pipeline changes.

```ts
type FieldDef = {
  key: string;
  label_de: string;
  type: 'text' | 'datetime' | 'date' | 'number' | 'enum' | 'bool' | 'list';
  required: boolean;
  source?: 'project' | 'user' | 'computed';      // project = auto-filled, never asked
  question_hint: string;                          // what Klara should ask, in plain English (LLM translates)
};

type DeadlineRule =
  | { kind: 'unverzueglich' }                                  // green same day, yellow next working day, red later
  | { kind: 'before_event'; event: 'work_start' }              // e.g. Mehrkostenanzeige
  | { kind: 'working_days_after'; days: number; from: string } // e.g. 12 Werktage
  | { kind: 'calendar_days_after'; days: number; from: string }
  | { kind: 'none' };

type DocTypeDef = {
  id: DocTypeId;
  title_de: string;
  legal_basis: string;              // shown as info, e.g. "§ 6 Abs. 1 VOB/B"
  tier: 'A' | 'B' | 'C';
  build_priority: 'must' | 'should' | 'could';
  recipient: 'client_with_authority' | 'subcontractor' | 'internal';
  fields: FieldDef[];
  deadline: DeadlineRule;
  checks: CheckId[];
  template: (ctx: TemplateCtx) => DocBody;   // fixed German text with placeholders
  max_questions: 3;
};
```

### 5.1 Catalog

| id | German title | Basis | Recipient | Deadline | Priority |
|---|---|---|---|---|---|
| `behinderungsanzeige` | Behinderungsanzeige | § 6 Abs. 1 VOB/B | client | unverzüglich, schriftlich (also for *expected* hindrance) | **must** |
| `behinderung_ende` | Anzeige Wegfall der Behinderung / Wiederaufnahme | § 6 Abs. 3 VOB/B | client | unverzüglich | **must** |
| `mehrkostenanzeige` | Ankündigung Mehrvergütung | § 2 Abs. 6 Nr. 1 VOB/B | client | **before work starts** | **must** |
| `anordnung_bestaetigung` | Bestätigung einer mündlichen Anordnung | VOB/B: evidence; BGB: § 650b Abs. 2 (Textform) | client (cc instructing person) | same day (practice) | **must** |
| `stellungnahme_zurueckweisung` | Stellungnahme zur Zurückweisung | reply | client | short (3 working days, practice) | **must** (demo) |
| `bautagesbericht` | Bautagesbericht | contract / ZVB; fields per VHB Bund RL 411 | internal / client weekly | daily | **must** |
| `bedenkenanzeige` | Bedenkenanzeige | § 4 Abs. 3 VOB/B | client | unverzüglich, ideally before work | should |
| `verzug_nu` | Abhilfeaufforderung / Verzugsschreiben an NU | § 5 Abs. 3–4 VOB/B (sub contract) | subcontractor | set reasonable deadline | should |
| `info_folgegewerk` | Information an Folgegewerke (Terminverschiebung) | — | subcontractors | same day | should |
| `leistung_ohne_auftrag` | Anzeige einer Leistung ohne Auftrag | § 2 Abs. 8 Nr. 2 VOB/B | client (not only architect) | unverzüglich | could |
| `stundenlohn_anzeige` | Anzeige Stundenlohnarbeiten + Stundenlohnzettel | § 15 Abs. 3 VOB/B | client | before start; Zettel daily/weekly; client returns ≤ 6 Werktage | could |
| `maengelanzeige_nu` | Mängelanzeige an NU | § 4 Abs. 7 VOB/B | subcontractor | set reasonable deadline | could |
| `besprechungsprotokoll` | Baubesprechungsprotokoll | practice | all participants | same day | should |
| `protokoll_widerspruch` | Widerspruch gegen Protokoll | commercial confirmation letter doctrine | author of minutes | unverzüglich | could |

**Deadline-only watchers (no document generated in prototype, show in "Fristen" panel):** acceptance (§ 12: 12 Werktage on request; fictitious 12 Werktage after completion notice / 6 Werktage after use — unless excluded in `project.settings`), final invoice (§ 14 Abs. 3: 12 Werktage after completion for ≤ 3 months contract, +6 per further 3 months), progress payment due 21 days, final payment due ≤ 30 days (max 60), **reservation against final payment 28 days + 28 days to justify (§ 16 Abs. 3 Nr. 5)**, interruption > 3 months → termination right (§ 6 Abs. 7).

**Working days (Werktage)** = Mon–Sat, excluding Sundays and Bavarian public holidays. Implement in `lib/deadlines.ts` with unit tests.

### 5.2 Fields + Klara's questions per must-type

**`behinderungsanzeige`**
- project (auto): project name/address, contract no/date, client name/address, recipient contact with authority
- user: `start_at` (datetime, required) — *"Since when exactly? Date and time."*
- user: `area` (required) — *"Where exactly (floor/section)?"*
- user: `cause` (required) — *"What exactly is blocking you?"*
- user: `affected_works` (required, can be inferred from schedule) — *"Which of your works are affected?"*
- user: `idle_resources` (required: people, machines) — *"How many people and machines are standing idle?"*
- user: `expected_duration` (optional; if unknown → "derzeit nicht absehbar") — *"How long do you expect it to last?"*
- computed: `sphere` (from trade.contracted_by), `weather` (Open-Meteo), `evidence` refs
- Sphere routing: `client` → this doc; `own_sub` → `verzug_nu` + internal risk; `own_team` → diary entry + internal risk, no letter; `weather` → this doc but **time extension only, no cost reservation**, and only if weather was unusual (§ 6 Abs. 2 Nr. 2: weather to be expected at bid time is not a hindrance); `unclear` → ask *"Who hired the <trade>?"*
- Follow-up: daily push "Besteht die Behinderung noch?" until `behinderung_ende`.

**`mehrkostenanzeige`**
- user: `instruction_date`, `instructed_by` (person + role), `description` (what exactly), `work_started` (bool, **always ask** — *"Have you already started this work?"*), `planned_start`
- optional: `estimate_eur` ("wird ermittelt" if missing)
- Checks: if `work_started = true` → red "Ankündigung vor Ausführung versäumt" + escalate; if `instructed_by` lacks authority → recipient = client, cc architect; if LV coverage unknown → yellow "Bitte prüfen: im LV enthalten?"
- Always also creates `anordnung_bestaetigung` if instruction was verbal.

**`anordnung_bestaetigung`**
- user: `date`, `time`, `place`, `instructed_by`, `instruction_text` (as literal as possible), `witnesses`
- BGB projects: add sentence requesting confirmation **in Textform (§ 650b Abs. 2 BGB)**.

**`behinderung_ende`**
- parent: original `behinderungsanzeige`
- user: `end_at`, `resumed_at`, `still_affected`
- computed: idle days, person-hours, equipment-days from daily reports in the period (show as "Grundlage dokumentiert"; any € value labeled "vorläufige Schätzung lt. Kalkulation")

**`stellungnahme_zurueckweisung`** (generated from a classified reply)
- auto: reference to original letter (date, reference), quoted core of client's rejection (≤ 1 sentence)
- auto: evidence list (timestamps, photos, diary entries, weather, schedule vs actual)
- Hinweis shown to admin (not in letter): "Eine Zurückweisung macht die Behinderungsanzeige nicht unwirksam."

**`bautagesbericht`** (fields modeled on VHB Bund RL 411 + contractor practice)
- date, weather (auto: condition, min/max temp), staff by qualification (Polier / Facharbeiter / Helfer, counts), equipment, deliveries, work performed per schedule item (qty vs plan), instructions received, hindrances/defects/accidents ("Besondere Vorkommnisse"), photos, signature fields
- Flow: evening "call" asks **only per today's schedule items** ("Estrich 2.OG: wie viele m²?") + "Besondere Vorkommnisse?". Anything in "Besondere Vorkommnisse" goes through the claim radar again.

### 5.3 German templates (fixed text; placeholders in `{}`)

> Templates are drafts for the prototype. **Mark them `// TODO legal review`**. Do not let the LLM rewrite the fixed sentences.

**Behinderungsanzeige**
```
Behinderungsanzeige gemäß § 6 Abs. 1 VOB/B
Bauvorhaben: {project.name}, {project.address}
Vertrag Nr. {project.contract_no} vom {project.contract_date}
Unser Zeichen: {case.reference}

Sehr geehrte Damen und Herren,

hiermit zeigen wir Ihnen an, dass wir in der ordnungsgemäßen Ausführung unserer vertraglichen Leistungen behindert sind.

Beginn der Behinderung: {start_at:dd.MM.yyyy, HH:mm} Uhr
Bereich: {area}
Hindernde Umstände: {cause}
Betroffene Leistungen: {affected_works}
Auswirkungen: Derzeit sind {idle_staff} Arbeitskräfte {idle_equipment?" sowie " + idle_equipment} ohne Einsatzmöglichkeit.
Voraussichtliche Dauer: {expected_duration ?? "derzeit nicht absehbar"}

Wir bitten Sie, die hindernden Umstände umgehend zu beseitigen.
Die vereinbarten Ausführungsfristen verlängern sich gemäß § 6 Abs. 2 und 4 VOB/B entsprechend.
{sphere==='client' ? "Die Geltendmachung weiterer Ansprüche, insbesondere nach § 6 Abs. 6 VOB/B und § 642 BGB, behalten wir uns ausdrücklich vor." : ""}
Sobald die Behinderung entfällt, nehmen wir die Arbeiten unverzüglich wieder auf und informieren Sie hierüber.

Mit freundlichen Grüßen
{signatory.name}
Bauleitung, {company.name}
```

**Ankündigung Mehrvergütung**
```
Ankündigung eines Anspruchs auf besondere Vergütung gemäß § 2 Abs. 6 Nr. 1 VOB/B
Bauvorhaben / Vertrag / Unser Zeichen: (as above)

Sehr geehrte Damen und Herren,

am {instruction_date} wurde durch {instructed_by.name} ({instructed_by.role}) folgende im Vertrag nicht vorgesehene Leistung gefordert:
{description}

Wir kündigen hiermit vor Beginn der Ausführung unseren Anspruch auf besondere Vergütung an.
Die Mehrkosten betragen nach erster Einschätzung {estimate_eur ? "ca. " + estimate_eur + " € netto" : "– werden derzeit ermittelt –"}. Ein Nachtragsangebot reichen wir kurzfristig nach.
Geplanter Ausführungsbeginn: {planned_start}.

Wir bitten um schriftliche Bestätigung der Beauftragung.

Mit freundlichen Grüßen …
```

**Bestätigung einer mündlichen Anordnung**
```
Bestätigung einer mündlichen Anordnung
…
am {date} um {time} Uhr hat {instructed_by.name} ({instructed_by.role}) auf der Baustelle ({place}) folgende Anordnung erteilt:
„{instruction_text}"
Anwesend: {witnesses}

Wir bestätigen hiermit den Erhalt dieser Anordnung und bitten Sie als Auftraggeber um schriftliche Bestätigung bis {reply_by}.
{contract_type==='BGB' ? "Wir bitten um Bestätigung der Anordnung in Textform (§ 650b Abs. 2 BGB)." : ""}
{has_mehrkosten ? "Zu den Mehrkosten verweisen wir auf unsere gesonderte Anzeige vom " + mk_date + " (Zeichen " + mk_ref + ")." : ""}
```

**Stellungnahme zur Zurückweisung**
```
Ihr Schreiben vom {reply_date} – Zurückweisung unserer Behinderungsanzeige vom {orig_date} (Zeichen {orig_ref})

Sehr geehrte Damen und Herren,

wir nehmen Bezug auf Ihr o. g. Schreiben. An unserer Behinderungsanzeige halten wir fest.
Die Behinderung ist wie folgt dokumentiert:
{evidence_bullets}

Wir bitten Sie, die hindernden Umstände umgehend zu beseitigen. Über den Fortbestand der Behinderung informieren wir Sie weiterhin.
```

PDF layout: page 1 = letter (company letterhead, logo). **Page 2 = internal audit page** (NOT attached to outgoing email by default): sha256 of page-1 content, timestamps, transcript (original language + German), weather, photo thumbnails, validated_by. Put the "KI-unterstützt erstellt, vom Bauleiter geprüft" marker on the **internal page**, not on the letter (see Decision D9).

---

## 6. Agent pipeline

### 6.1 `/api/voice` (POST, multipart audio)
→ STT → `{ text_original, language, text_de }` (translate to German with a cheap LLM call only if language ≠ de). Target < 2 s.

### 6.2 `/api/agent/turn` (POST)
Input: `{ conversation_id, text_original, language }`. Server loads context: project (trades with `contracted_by`, contacts with authority), today's schedule items, open cases for this team, last 10 turns.

Call Claude with **forced tool** `record_turn`:

```json
{
  "name": "record_turn",
  "input_schema": {
    "type": "object",
    "properties": {
      "intent": { "enum": ["report_event", "diary_answer", "answer_question", "confirm", "deny", "smalltalk", "end_call"] },
      "events": {
        "type": "array",
        "description": "One user utterance may contain several events (e.g. hindrance + verbal instruction). Split them.",
        "items": {
          "type": "object",
          "properties": {
            "doc_type": { "enum": ["behinderungsanzeige","behinderung_ende","mehrkostenanzeige","anordnung_bestaetigung","bedenkenanzeige","leistung_ohne_auftrag","stundenlohn_anzeige","maengelanzeige_nu","diary_only","none"] },
            "trade_name_guess": { "type": "string" },
            "facts": { "type": "object", "description": "Only facts the user actually said. Never infer times, numbers or names." },
            "confidence": { "type": "number" }
          }
        }
      },
      "reply_language": { "type": "string" }
    },
    "required": ["intent", "events"]
  }
}
```

Then **deterministic code**:
1. Merge facts into open case (or create case).
2. Rules engine computes `sphere`, recipient, `missing_fields`, checks, deadline.
3. If `confidence < 0.6` → ask a clarifying question instead of creating a case.
4. Pick next question: first missing required field (max 3 questions per case; after that create doc with yellow fields).
5. When nothing required is missing → build a **readback** sentence and ask for confirmation.
6. On `confirm` → generate `document_version` v1 (PDF + DOCX), set status `bereit`, emit realtime event.

A **second small LLM call** phrases the next question / readback **in the user's language**, given the field `question_hint` and facts. Keep Klara's lines short (≤ 25 words), polite, informal ("Sie" in German).

### 6.3 System prompt rules (put in `lib/agent/prompt.ts`)
- You are Klara, assistant to a construction company. You help document site events.
- Extract only facts the user stated. If unsure, leave the field empty — code will ask.
- Split multiple events in one utterance.
- Never decide legal outcomes. Never promise money. Never say a claim is valid or invalid.
- Never mention paragraphs to the worker; just ask simple questions.

### 6.4 Reply analysis — `/api/email/inbound`
1. Postmark webhook → store `email_in`.
2. Match case: (a) `In-Reply-To` = our `email_out.message_id`; (b) else reference `KL-\d{4}-\d{4}` in subject/body; (c) else project contact email → admin must assign.
3. Claude forced tool `classify_reply`: `{ kind: "acceptance" | "rejection" | "request_info" | "counter_instruction" | "change_request" | "other", summary_de, key_points[], requested_items[] }`.
4. Map to proposal:
   - `rejection` of `behinderungsanzeige` → `stellungnahme_zurueckweisung` draft + Hinweis
   - `request_info` → supplement draft (`ergaenzung`) with the requested items pre-asked to the Polier
   - `change_request` / `counter_instruction` → `mehrkostenanzeige` + `anordnung_bestaetigung` drafts; BGB: show 30-day counter
   - `acceptance` → close case, log
   - `other` → summary only
5. Realtime event → admin sees "Antwort eingegangen" with proposal card.

---

## 7. Rules engine (`lib/rules/*.ts`, pure functions, unit-tested)

**Traffic light checks**

| Check | Green | Yellow | Red |
|---|---|---|---|
| Required fields | all present | list missing | — |
| Recipient | contact `has_authority` | auto-replaced ("Architekt → Bauherr") | no contact with authority |
| Timing (unverzüglich) | drafted same day as event | next working day | later ("unverzüglich?") |
| Timing (Mehrkosten) | `work_started=false` | unknown → ask | `work_started=true`: "Ankündigung vor Ausführung versäumt" |
| Sphere | `client` | `weather` (time only) / `unclear` (ask) | `own_sub`/`own_team` → no client claim, other route |
| Channel | signed PDF + delivery log | plain email | WhatsApp/verbal only |
| Classification confidence | ≥ 0.6 | < 0.6 → ask | — |

Every light shows a **German reason text**. Never show a light without a reason.

**Deadlines:** `computeDeadline(rule, eventAt, project) → { due_at, status: 'ok'|'due_today'|'overdue', label_de }`. Use a **demo clock** (`DEMO_NOW` offset in settings) so we can show countdowns on stage.

**Plan vs actual:** `daily_rate = actual_qty / planned_per_day`; `forecast_delay_days = remaining_qty / avg_actual_per_day − remaining_planned_days`; if > 0 → deviation + `info_folgegewerk` suggestion for items in `depends_on`.

---

## 8. Screens

**Mobile (Polier) — German UI**
- `/app` — projects → team channels
- `/app/channel/[teamId]` — feed (messages, call summaries, case cards), big round mic button, "Klara anrufen", "Foto", morning card ("Alles nach Plan" / "Abweichung melden")
- `/app/call/[callId]` — call screen: Klara avatar, recording notice ("Dieses Gespräch wird aufgezeichnet"), live transcript (original + DE subtitle), push-to-talk, text fallback, photo button
- `/app/case/[id]` — case card: type, status, traffic light, "PDF öffnen", "Per Sprache korrigieren"

**Desktop (Bauleiter/Büro)**
- `/admin` — left: project tree; center: case table (type, reference, author, status, deadline badge, light); right: details. Top: "Fristen heute/morgen" and red flags.
- `/admin/case/[id]` — tabs: Dokument (PDF preview, version switch), Nachweise, Verlauf (timeline of events incl. emails), Hinweise. Buttons: **Validieren**, **Zurück zur Ergänzung** (sends question to Polier in their language), **E-Mail vorbereiten**, **Word herunterladen**, **PDF herunterladen**.
- `/admin/mail/[draftId]` — composer: To (prefilled authority contact), CC (prefilled instructing person), Subject (auto), Attachments (auto: letter PDF; DOCX optional), Body (AI-suggested, editable), **Senden** (disabled until case `validiert`).
- `/admin/meetings` — upload audio → protocol (items, responsible, deadline, status) + detected instructions → one click creates cases.
- `/admin/demo` — reset seed, simulate 07:00 / 16:00, simulate client reply, set demo clock.

**Email subject format:** `{title_de} – BV {project.name} – Zeichen {case.reference}`
e.g. `Behinderungsanzeige gem. § 6 Abs. 1 VOB/B – BV Neubau Bürogebäude München – Zeichen KL-2026-0042`

---

## 9. Seed data (fictional)

- Company: **Muster Bau GmbH**, Munich (logo placeholder)
- Project: **Neubau Bürogebäude München**, VOB/B, contract no. `MB-2026-117` dated 2026-03-02, lat/lng Munich
- Contacts: **Bauherr** – Immobilien Isar GmbH, Dr. Petra Lang, `has_authority=true`; **Architekt** – Büro Weber, Thomas Weber, `has_authority=false`; NU contacts for Trockenbau & Bodenbelag
- Trades: Elektro (**client**), Trockenbau (**us**, NU), Estrich (**us**, own team), Bodenbelag (**us**, NU, depends on Estrich)
- Schedule: Estrich 2.OG 200 m² @ 40 m²/day; Elektro 3.OG; Trockenbau 2.OG; Bodenbelag after Estrich
- Teams: "Team Estrich" (Polier, language `ru`), "Team Ausbau" (Polier, language `pl`); one Bauleiter on both
- Demo mailboxes: our sender + a "Bauherr" mailbox a teammate controls

---

## 10. Test scenarios (must pass; also used as the eval set)

1. Morning: "Alles nach Plan" → diary entry, no case.
2. RU: electricians blocking 2.OG, 4 idle → `behinderungsanzeige`, sphere client, ≤ 2 questions, readback, PDF+DOCX, admin realtime.
3. RU: "Architekt Weber sagte mündlich: 3 zusätzliche Brandschutztüren" → `anordnung_bestaetigung` + `mehrkostenanzeige`; recipient replaced → Bauherr; question "schon begonnen?"
4. "Trockenbauer sind nicht gekommen" → **no** Behinderungsanzeige; `verzug_nu` + internal risk flag.
5. "Sturm, Kran stand den ganzen Tag" → Behinderungsanzeige **without** cost reservation, weather attached; Hinweis if weather may be "normal".
6. Evening: "Estrich nur 15 m²" → 38 % of plan, delay forecast, `info_folgegewerk` for Bodenbelag.
7. Inbound rejection email → classified `rejection` → `stellungnahme_zurueckweisung` draft with evidence.
8. Utterance with two events (hindrance + instruction) → two cases.
9. Low-confidence utterance ("es ist irgendwie blöd heute") → clarifying question, no case.
10. "Arbeiten schon begonnen" on Mehrkosten → red light + escalation flag.

Create `eval/utterances.json` with **≥ 30 labeled utterances** (RU/PL/DE/TR mix; expected `doc_type`, `sphere`, `missing_fields`) and a script `pnpm eval` that prints accuracy. Target: ≥ 90 % doc_type, 100 % sphere (sphere is deterministic once trade is identified).

---

## 11. Milestones (build in this order)

- **M0 – Skeleton (2 h):** Next.js + Supabase + Vercel deploy, env, seed script, role switcher, empty screens.
- **M1 – Text pipeline (4 h):** `/api/agent/turn` with forced tool use, rules engine (sphere, recipient, missing fields, deadlines + tests), case creation, readback/confirm — **text only**.
- **M2 – Documents (3 h):** registry + templates for the 5 must types + Bautagesbericht; PDF + DOCX; sha256; versioning; admin case view with traffic lights.
- **M3 – Voice (5 h):** call screen, **hands-free turn-taking with VAD**, push-to-talk fallback, STT, TTS in user language, latency < 4 s per turn.

  **Voice mode details (M3)**
  - Build in two steps: (1) push-to-talk end-to-end first (MediaRecorder → `/api/voice` → `/api/agent/turn` → TTS); (2) then add hands-free on top of the *same* pipeline. Never break step 1.
  - VAD: `@ricky0123/vad-web` (Silero VAD in the browser). On `onSpeechEnd` → send the audio segment to `/api/voice`.
  - Tunable settings in `/admin/demo`: silence before end of turn (default ~800 ms), minimum speech length (default ~400 ms, ignore shorter blips), positive-speech threshold (raise it in a noisy hall).
  - **Turn state machine:** `listening` → `user_speaking` → `processing` → `klara_speaking` → `listening`. **Pause the VAD while Klara is processing or speaking** so she never hears herself; resume ~300 ms after TTS playback ends. No barge-in in v1.
  - Mic constraints: `echoCancellation: true, noiseSuppression: true, autoGainControl: true`.
  - iOS/Safari: mic permission and AudioContext must start from a user tap. The "Annehmen" (accept call) / "Klara anrufen" button is that gesture: unlock audio + start VAD there.
  - Toggle on the call screen: **"Freihändig" ⇄ "Push-to-Talk"**, plus a text field fallback. Switching modes must not lose the conversation.
  - UI per state: pulsing ring while listening, live waveform while the user speaks, "Klara denkt…" animation while processing, Klara avatar animating while speaking. Show live transcript (original + DE subtitle).
  - Ignore segments whose transcript is empty or under 2 words ("uh", coughs) — don't send them to the agent.
  - End of call: user says "that's all"/"danke, tschüss" (intent `end_call`) or taps "Auflegen".
- **M4 – Email loop (3 h):** composer with prefilled subject/recipients/attachment + AI body, Postmark send, inbound webhook, case matching, reply classification, follow-up draft.
- **M5 – Realtime & polish (2 h):** live admin updates, timeline, demo page, reset, demo clock, fallbacks.
- **M6 – Eval & rehearsal:** eval set, fix failures, 5 full demo rehearsals on the real phone + projector.
- **Should (if time):** Bautagesbericht evening flow with plan/actual, meeting upload → protocol, `behinderung_ende` with computed idle basis, `bedenkenanzeige`, `verzug_nu`, `info_folgegewerk`, PL language.
- **Could:** realtime voice, protocol objection check, Nebenleistung (VOB/C) hint, hourly work, validation/escalation email to management.

## 12. Done criteria
- [ ] Scenario 2 → validated → sent → reply → follow-up draft runs end-to-end in ≤ 2:30 without reload.
- [ ] Nothing can be sent without `validiert`. Sent versions are immutable.
- [ ] Every document exists as PDF **and** DOCX, German, with case reference.
- [ ] Every traffic light has a reason text.
- [ ] Deadlines use Werktage (Mon–Sat, Bavarian holidays excluded), unit-tested.
- [ ] Text fallback and "Antwort simulieren" work.
- [ ] `pnpm eval` ≥ 90 % doc_type accuracy.

## 13. Out of scope
Real phone numbers, OAuth email (Outlook/Gmail), LV/GAEB parsing, full Gantt editor, native app, full offline mode, real auth/multi-tenant, QR signature on site, € claim calculation beyond "vorläufige Schätzung".

## 14. Open decisions (defaults used until the team says otherwise)
- **D1** Hackathon length / team size → scope of Should list. *Default: ~24–36 h, 3–4 devs.*
- **D2** Live demo language → **DECIDED: English.** Documents stay German. Multilingual support (RU/PL/TR) stays in the product and the eval set, shown on a slide or in video.
- **D3** Voice mode → **DECIDED: hands-free (browser VAD) as the main mode, push-to-talk as a toggle fallback.** Realtime speech-to-speech is Could. See "Voice mode details" in Milestone M3.
- **Latency tip for M3:** for `en`, `de`, `ru`, store pre-written question/readback phrasings per field in the registry, so no second LLM call is needed for phrasing. Use the LLM phrasing call only for other languages. Start TTS playback as soon as the first audio chunk arrives (streaming).
- **D4** Email provider → *Default: Postmark (outbound + inbound). DNS verified before event.*
- **D5** Scripted client reply → *Default: rejection of Behinderungsanzeige.*
- **D6** Validation/escalation-to-management feature → *Default: Could, not in demo.*
- **D7** Who is shown as user → *Default: Polier calls, Bauleiter validates & sends.*
- **D8** Legal review of templates → *Default: TODO markers; find a VOB/B-experienced reviewer before final.*
- **D9** "KI-unterstützt" marker → *Default: internal audit page only, not on the outgoing letter.*
- **D10** LLM model IDs → *Default: env vars; verify current IDs in provider docs.*
