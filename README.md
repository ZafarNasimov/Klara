# Klara

KI-Assistentin für Bauleiter und Poliere: Ereignisse auf der Baustelle in jeder Sprache melden, Klara erstellt das deutsche Schreiben (z. B. Behinderungsanzeige nach § 6 Abs. 1 VOB/B), die Bauleitung prüft und versendet. Vollständige Spezifikation: [SPEC.md](./SPEC.md).

## Starten

```bash
npm install
cp .env.example .env.local   # optional, alles läuft auch ohne Schlüssel
npm run seed                  # Demodaten (SPEC §9)
npm run dev                   # http://localhost:3000
```

- `/app` – Polier (Mobil): Team-Kanal mit Text-Chat an Klara
- `/admin` – Bauleitung/Büro: Vorgänge mit Ampel, Details
- `/admin/demo` – Demo zurücksetzen

## Betriebsarten

| Variable | Ohne Wert | Mit Wert |
|---|---|---|
| `DATA_BACKEND` | Speicher im Prozess (`.data/db.json`) | `supabase`, wenn `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` gesetzt |
| `LLM_MODE` | `mock`: Stichwort-Erkennung, nur zum Durchklicken | `live`, wenn `ANTHROPIC_API_KEY` gesetzt; Modell aus `ANTHROPIC_MODEL` |

Supabase-Schema: `supabase/migrations/0001_init.sql` (im SQL-Editor ausführen, danach `npm run seed`).

## Prüfen

```bash
npm test          # Regeln, Werktage/Fristen, Agent-Durchlauf (Vitest)
npm run typecheck
```

## Architektur in Kürze

- `src/lib/agent` – `/api/agent/turn`: das LLM liest nur die Äußerung (Tool `record_turn`), alles Weitere ist deterministischer Code.
- `src/lib/rules` – Sphäre, Adressat, Ampelprüfungen mit deutscher Begründung (reine Funktionen, getestet).
- `src/lib/deadlines.ts` – Werktage (Mo–Sa ohne bayerische Feiertage) und Fristen.
- `src/lib/doctypes` – Registry aller Dokumenttypen (Felder, Fragen, Fristen, Prüfungen).
- `src/lib/db` – Speicher-Abstraktion (Memory oder Supabase), Seed.
