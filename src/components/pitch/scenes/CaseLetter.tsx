"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { CASE } from "../pitch-story";
import { u } from "../stage";

const NUMBER_WORDS = ["Null", "Ein", "Zwei", "Drei", "Vier", "Fünf", "Sechs", "Sieben", "Acht", "Neun", "Zehn", "Elf", "Zwölf"];
/** "ca. 2 Arbeitstage" → "ca. 2 Arbeitstagen" (dative after "von"). */
const dative = (s: string) => (/e$/.test(s) ? `${s}n` : s);

/**
 * The formal letter, generated from the validated form (Scene 3.5). Every
 * statement comes from CASE (the same values the form shows) via this fixed
 * template; values taken from form fields are wrapped in <Field> so the
 * field → letter mapping can light up.
 */
export function CaseLetter({ today, highlight }: { today: string; highlight: boolean }) {
  const crew = NUMBER_WORDS[CASE.crew] ?? String(CASE.crew);
  const s = CASE.sender;
  return (
    <div lang="de" className="flex h-full flex-col text-zinc-900" style={{ padding: `${u(56)} ${u(64)} ${u(40)}`, fontSize: u(14.5), lineHeight: 1.5 }}>
      {/* DIN 5008: return line, address block, date, reference line */}
      <p className="border-b border-zinc-300 text-zinc-500" style={{ fontSize: u(10.5), paddingBottom: u(2), width: "fit-content" }}>
        {s.company} · {s.unit} · {s.address}
      </p>
      <div className="flex items-start justify-between" style={{ marginTop: u(14) }}>
        <address className="not-italic">
          {CASE.client}
          {CASE.clientAddress.map((l) => (
            <span key={l} className="block">
              {l}
            </span>
          ))}
        </address>
        <p>
          {s.city}, {today}
        </p>
      </div>
      <p className="text-zinc-600" style={{ marginTop: u(26), fontSize: u(12.5) }}>
        Unser Zeichen: {CASE.reference} · Bauvertrag Nr. {CASE.contractNo}
      </p>
      <p className="font-semibold" style={{ marginTop: u(14) }}>
        Behinderungsanzeige gemäß § 6 Abs. 1 VOB/B — Bauvorhaben {CASE.bauvorhaben}
      </p>

      <div className="flex flex-col" style={{ marginTop: u(16), gap: u(10) }}>
        <p>Sehr geehrte Damen und Herren,</p>
        <p>
          hiermit zeigen wir Ihnen gemäß § 6 Abs. 1 VOB/B an, dass wir seit dem{" "}
          <Field on={highlight}>
            {today}, {CASE.startTime} Uhr
          </Field>
          , in der Ausführung unserer vertraglich geschuldeten Leistungen behindert sind.
        </p>
        <p>
          Ursache:{" "}
          <Field on={highlight}>
            Die {CASE.blockingWork} im {CASE.area} sind nicht abgeschlossen, die Fläche wurde nicht freigegeben.
          </Field>{" "}
          Die {CASE.blockingWork} werden <Field on={highlight}>durch Sie als Auftraggeber beauftragt</Field>; die Behinderung liegt daher in Ihrem Verantwortungsbereich.
        </p>
        <p>
          Betroffen sind{" "}
          <Field on={highlight}>
            die {CASE.affectedWork} im {CASE.area}
          </Field>
          .{" "}
          <Field on={highlight}>
            {crew} {CASE.crewRole}
          </Field>{" "}
          können ihre Arbeit derzeit nicht aufnehmen. Wir rechnen mit einer Behinderungsdauer von <Field on={highlight}>{dative(CASE.duration)}</Field>; Auswirkungen auf nachfolgende
          Gewerke sind möglich. <Field on={highlight}>Eine Fotodokumentation des gesperrten Bereichs liegt bei.</Field>
        </p>
        <p>
          Wir bitten Sie, die Fläche schnellstmöglich freizugeben. Die Ausführungsfristen verlängern sich entsprechend der Dauer der Behinderung (§ 6 Abs. 2
          VOB/B). Ansprüche auf Bauzeitverlängerung und Mehrkosten, insbesondere nach § 6 Abs. 6 VOB/B bzw. § 642 BGB, behalten wir uns ausdrücklich vor. Den
          Wegfall der Behinderung zeigen wir Ihnen gesondert an.
        </p>
        <p>Mit freundlichen Grüßen</p>
        <p>
          {s.signer}, {s.signerRole}
          <span className="block">{s.company}</span>
        </p>
        <p className="text-zinc-600" style={{ fontSize: u(12.5) }}>
          Anlage: {CASE.photo.count} Foto ({CASE.photo.label})
        </p>
      </div>

      <p className="mt-auto border-t border-zinc-200 text-zinc-400" style={{ paddingTop: u(8), fontSize: u(10.5) }}>
        KI-unterstützt erstellt mit Klara · vom {s.signerRole} geprüft · {CASE.reference}
      </p>
    </div>
  );
}

/** A value that comes from a form field: underlined in blue-50 for ~1.5 s, then fades. */
function Field({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <motion.span
      className="rounded-[2px] box-decoration-clone"
      initial={false}
      animate={
        on
          ? {
              backgroundColor: ["rgb(239 246 255 / 0)", "rgb(219 234 254 / 1)", "rgb(219 234 254 / 1)", "rgb(239 246 255 / 0)"],
              boxShadow: ["inset 0 -2px 0 rgb(37 99 235 / 0)", "inset 0 -2px 0 rgb(37 99 235 / 0.7)", "inset 0 -2px 0 rgb(37 99 235 / 0.7)", "inset 0 -2px 0 rgb(37 99 235 / 0)"],
            }
          : { backgroundColor: "rgb(239 246 255 / 0)", boxShadow: "inset 0 -2px 0 rgb(37 99 235 / 0)" }
      }
      transition={on ? { duration: 2.1, times: [0, 0.12, 0.72, 1], ease: "easeInOut", delay: 0.75 } : { duration: 0.2 }}
    >
      {children}
    </motion.span>
  );
}
