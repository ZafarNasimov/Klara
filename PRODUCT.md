# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

One Next.js web app with two surfaces: a mobile web view for the site, and a desktop view for the office. Not a native app.

## Users

- **Polier / Bauleiter (primary, on site):** uses a phone outdoors, often with gloves, in noise, and is often not a native German speaker. Their job is to report what happened on site (daily progress, hindrances, extra work, verbal orders) without typing German forms.
- **Office: project lead, admins, management (desktop):** oversee many projects and cases at once. Their job is to see which documents are ready, which are missing information, and which are blocked, then validate or return them.
- **Demo jury:** German construction professionals aged 40–50. Klara must read as trustworthy, calm and modern, not playful.

## Product Purpose

Klara is an AI reporting system for the whole construction site. Site staff talk to Klara by voice in their own language (German, Polish, Romanian, Turkish, Russian). Klara turns that into correct German site documents, checks them for completeness, and asks follow-up questions in the speaker's language until the document is complete. The office sees what is missing and can act on it.

Success means site documentation that is complete, legally usable and on time, with no German form-filling by the people on site.

## Positioning

Voice-first, any language in, German VOB/B-compliant documents out, with a completeness check that chases missing facts in the worker's own language (by chat or by calling them: "Klara ruft an").

_Open: how Klara positions against named competitors has not been stated yet. It will come with the project specs._

## Operating Context

Documents Klara produces (all in German):
- Bautagesbericht (daily report)
- Baubesprechungsprotokoll (meeting minutes)
- Behinderungsanzeige (§ 6 Abs. 1 VOB/B)
- Mehrkostenanzeige (§ 2 Abs. 5/6 VOB/B)
- Bestätigung mündlicher Anordnungen (confirmation of verbal orders)

Workflow:
1. Polier/Bauleiter speaks to Klara on the phone. The UI is a chat with document cards and one main mic button.
2. Klara drafts the German document and checks completeness.
3. If something is missing, Klara asks back in the speaker's language, or calls the person ("Klara ruft an").
4. The office sees each case with a traffic-light status: ready, missing / auto-corrected, blocked.
5. Admins validate or return documents.
6. Klara drafts an escalation email to management about missing items.

## Capabilities and Constraints

- UI language is German. Klara replies in the user's language. All documents and PDFs are German.
- Mobile surface: chat with document cards, a big mic button, a full-screen call screen.
- Desktop surface: project tree, case table, detail panel with PDF, evidence and history.
- Hackathon project: a demo for a jury, not yet production.
- _Open: data sources, integrations, authentication, speech and LLM providers, and PDF generation are undecided. They will come with the project specs._

## Brand Commitments

- Name: **Klara**. The mascot is a friendly robot named Klara, used on the splash screen, in chat and on the call screen. It is friendly but not childish.
- Voice: sachlich, klar, verlässlich. Short and direct in the app; formal "Sie" in documents.
- Visual rules live in DESIGN.md and CLAUDE.md, not here.

## Evidence on Hand

None yet: no real customer data, testimonials, logos or case studies. Demo content must be realistic German construction data (plausible Bauvorhaben, Gewerke, Nachunternehmer, dates, VOB/B references). It must never be presented as real customers or real results.

## Product Principles

1. **Speak, don't type.** The site user should never have to fill in a German form.
2. **Complete before pretty.** A document is only done when every required fact is there; Klara chases what is missing.
3. **Their language in, legal German out.**
4. **Status is always explained.** Every ready / missing / blocked state says why.
5. **Calm authority.** Built to be trusted by experienced construction professionals.

## Accessibility & Inclusion

- Outdoor phone use with gloves and noise: large touch targets (min. 48px), high contrast, and voice as the main input.
- Multilingual users who are not native German speakers: plain wording, and follow-ups in their own language.
- Status must never rely on color alone.
