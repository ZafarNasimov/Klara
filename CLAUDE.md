@AGENTS.md

# Build status
Read [PROGRESS.md](PROGRESS.md) first: milestone status, how to run, env setup, known issues and the exact next steps. Update it and push at every checkpoint.

# Klara – UI Rules
- Stack: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, Motion, Lucide icons, shadcn charts.
- Language: UI in German. The agent Klara replies in the user's language; all documents/PDFs are German.
- Look: light, high-contrast, calm enterprise SaaS (Linear light mode, Attio, Notion as references). White / zinc-50 backgrounds, 1px zinc-200 borders, generous whitespace. One brand accent: blue-600.
- Status colors are reserved for the traffic light only: green = ready, amber = missing / auto-corrected, red = blocked. Never decorative. Always pair color with a text reason.
- Fonts: Geist Sans for text, Geist Mono for numbers, timestamps, document IDs.
- Mobile (site manager): min 48px touch targets, one big round mic button, chat with document cards, full-screen "Klara ruft an" call screen with the Klara robot avatar.
- Desktop (office): project tree left, case table center, detail panel right (PDF, evidence, history).
- Mascot: friendly robot "Klara" on the splash screen, in chat and on the call screen.
- Anti-slop: no purple/blue gradients, no glassmorphism, no default unstyled cards, no lorem ipsum. Use realistic German construction data.
- Motion: subtle and purposeful only (card appears, status changes, call ringing). No decorative loops.

## Skill routing (who leads what)
- New screens & visual direction: frontend-design skill.
- Brand/product context: PRODUCT.md and DESIGN.md (Impeccable). If any skill conflicts with DESIGN.md, DESIGN.md wins.
- After each new screen: run /impeccable critique, fix, then /impeccable polish.
- Animations only via the emilkowalski skills.
- Before demo: review all screens with web-design-guidelines (touch targets, contrast, focus, forms, German i18n).
- Components from 21st.dev only for a few hero moments (voice visualizer, chat input, status badges, timeline, splash); restyle them to DESIGN.md.
- Do not use any other design skill.
