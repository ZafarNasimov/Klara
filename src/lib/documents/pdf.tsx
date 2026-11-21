// PDF of a letter (SPEC §5.3). Page 1: the letter on the company letterhead,
// laid out after DIN 5008 (address window, info block, subject). Page 2: the
// internal audit page with hash, timestamps, checks and transcript; it carries
// the "KI-unterstützt erstellt" marker and is never attached to the email (D9).
import "server-only";
import {
  Document,
  Font,
  Image,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { fmtDateTime } from "@/lib/labels";
import type { CheckResult } from "@/lib/types";
import { dateDe } from "./templates/kit";
import type { DocBlock, DocBody } from "./types";

// German compounds must not be split at arbitrary points.
Font.registerHyphenationCallback((word) => [word]);

const MM = 2.8346;
const C = {
  text: "#18181b",
  muted: "#52525b",
  rule: "#e4e4e7",
  accent: "#2563eb",
  green: "#15803d",
  yellow: "#b45309",
  red: "#b91c1c",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 18 * MM,
    paddingBottom: 24 * MM,
    paddingLeft: 25 * MM,
    paddingRight: 20 * MM,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: C.text,
  },
  // lineHeight on the Page breaks fixed render-texts (page numbers) in react-pdf 4, and an
  // inherited one is scaled oddly; it is set on the text styles that need it instead.
  content: {},
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1.5,
    borderBottomColor: C.accent,
    paddingBottom: 3 * MM,
  },
  company: { fontFamily: "Helvetica-Bold", fontSize: 15, letterSpacing: 0.2 },
  headRight: { fontSize: 8, color: C.muted, textAlign: "right" },
  windowRow: { flexDirection: "row", marginTop: 17 * MM, minHeight: 45 * MM },
  window: { width: 85 * MM },
  returnLine: {
    fontSize: 7,
    color: C.muted,
    borderBottomWidth: 0.5,
    borderBottomColor: C.muted,
    marginBottom: 3 * MM,
    paddingBottom: 1,
  },
  info: { marginLeft: "auto", width: 60 * MM, fontSize: 9 },
  infoRow: { flexDirection: "row", marginBottom: 1.5 },
  infoLabel: { width: 24 * MM, color: C.muted },
  subject: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11.5,
    marginTop: 6 * MM,
    marginBottom: 3 * MM,
  },
  refs: { fontSize: 9.5, marginBottom: 5 * MM },
  refRow: { flexDirection: "row" },
  refLabel: { width: 30 * MM, color: C.muted },
  // A unitless lineHeight resolves against react-pdf's default font size unless fontSize is set on the same style.
  p: { marginBottom: 3 * MM, fontSize: 10.5, lineHeight: 1.4 },
  facts: {
    marginBottom: 3 * MM,
    borderLeftWidth: 1,
    borderLeftColor: C.rule,
    paddingLeft: 3 * MM,
  },
  factRow: { flexDirection: "row", marginBottom: 1.5 },
  factLabel: { width: 45 * MM, color: C.muted, fontSize: 10.5, lineHeight: 1.4 },
  factValue: { flex: 1, fontSize: 10.5, lineHeight: 1.4 },
  quote: {
    marginBottom: 3 * MM,
    marginLeft: 5 * MM,
    fontFamily: "Helvetica-Oblique",
    fontSize: 10.5,
    lineHeight: 1.4,
  },
  bullet: { flexDirection: "row", marginBottom: 1.5, paddingLeft: 2 * MM },
  // Amber = missing (DESIGN.md traffic light), so a gap is visible on paper.
  missing: { color: C.yellow, fontFamily: "Helvetica-Bold" },
  footerRule: {
    position: "absolute",
    left: 25 * MM,
    right: 20 * MM,
    bottom: 14 * MM,
    borderTopWidth: 0.5,
    borderTopColor: C.rule,
  },
  footerText: {
    position: "absolute",
    bottom: 10 * MM,
    fontSize: 7.5,
    color: C.muted,
  },
  h1: { fontFamily: "Helvetica-Bold", fontSize: 13, marginBottom: 1.5 * MM },
  h2: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginTop: 5 * MM,
    marginBottom: 2 * MM,
  },
  small: { fontSize: 8.5, color: C.muted },
  mono: { fontFamily: "Courier", fontSize: 8.5 },
  marker: {
    marginTop: 2 * MM,
    paddingVertical: 1.5 * MM,
    paddingHorizontal: 2.5 * MM,
    borderWidth: 1,
    borderColor: C.accent,
    color: C.accent,
    alignSelf: "flex-start",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  turn: { marginBottom: 2 * MM },
  // Report form (Bautagesbericht)
  section: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    marginTop: 4 * MM,
    marginBottom: 2 * MM,
    paddingBottom: 1 * MM,
    borderBottomWidth: 0.5,
    borderBottomColor: C.rule,
  },
  table: { marginBottom: 3 * MM },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.rule, paddingVertical: 1.2 * MM },
  th: { fontSize: 8.5, color: C.muted },
  td: { fontSize: 10, lineHeight: 1.35 },
  sigRow: { flexDirection: "row", gap: 10 * MM, marginTop: 10 * MM },
  sigBox: { flex: 1 },
  sigLine: { borderBottomWidth: 0.75, borderBottomColor: C.text, height: 14 * MM, marginBottom: 1.5 * MM },
  reportHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 * MM, marginBottom: 3 * MM },
  reportTitle: { fontFamily: "Helvetica-Bold", fontSize: 15 },
  grid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 0.5, borderTopColor: C.rule, marginBottom: 2 * MM },
  cell: { width: "50%", paddingVertical: 1.5 * MM, paddingRight: 3 * MM, borderBottomWidth: 0.5, borderBottomColor: C.rule },
});

/** Column widths for a report table: the first column takes the rest. */
function colWidths(n: number): string[] {
  if (n === 2) return ["75%", "25%"];
  if (n === 4) return ["49%", "17%", "17%", "17%"];
  return Array.from({ length: n }, () => `${100 / n}%`);
}

/** Text with "[fehlt: …]" placeholders highlighted, so a gap is visible on paper. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[fehlt: [^\]]+\])/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("[fehlt:") ? (
          <Text key={i} style={s.missing}>
            {p}
          </Text>
        ) : (
          p
        ),
      )}
    </>
  );
}

function Block({ b }: { b: DocBlock }) {
  switch (b.kind) {
    case "p":
      return (
        <Text style={s.p}>
          <Rich text={b.text} />
        </Text>
      );
    case "quote":
      return (
        <Text style={s.quote}>
          <Rich text={b.text} />
        </Text>
      );
    case "bullets":
      return (
        <View style={s.p}>
          {b.items.map((it, i) => (
            <View key={i} style={s.bullet} wrap={false}>
              <Text style={{ width: 4 * MM }}>–</Text>
              <Text style={{ flex: 1 }}>{it}</Text>
            </View>
          ))}
        </View>
      );
    case "facts":
      return (
        <View style={s.facts}>
          {b.rows.map((r) => (
            <View key={r.label} style={s.factRow} wrap={false}>
              <Text style={s.factLabel}>{r.label}</Text>
              <Text style={s.factValue}>
                <Rich text={r.value} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "heading":
      return (
        <Text style={s.section} minPresenceAhead={12 * MM}>
          {b.text}
        </Text>
      );
    case "table": {
      if (!b.rows.length) return <Text style={s.p}>{b.empty ?? "–"}</Text>;
      const w = colWidths(b.columns.length);
      return (
        <View style={s.table}>
          <View style={s.tr} wrap={false}>
            {b.columns.map((c, i) => (
              <Text key={c.label} style={[s.th, { width: w[i], textAlign: c.numeric ? "right" : "left" }]}>
                {c.label}
              </Text>
            ))}
          </View>
          {b.rows.map((r, ri) => (
            <View key={ri} style={s.tr} wrap={false}>
              {r.map((v, i) => (
                <Text key={i} style={[s.td, { width: w[i], textAlign: b.columns[i]?.numeric ? "right" : "left" }]}>
                  <Rich text={v} />
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    }
    case "signatures":
      return (
        <View style={s.sigRow} wrap={false}>
          {b.parties.map((p) => (
            <View key={p.role} style={s.sigBox}>
              <View style={s.sigLine} />
              <Text style={s.small}>
                {p.role}
                {p.name ? `: ${p.name}` : ""}, Datum, Unterschrift
              </Text>
            </View>
          ))}
        </View>
      );
  }
}

function Report({ body }: { body: DocBody }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.content}>
        <View style={s.head}>
          <Text style={s.company}>{body.sender.name}</Text>
          <Text style={s.headRight}>
            {body.sender.address}
            {"\n"}Bauleitung
          </Text>
        </View>
        <View style={s.reportHead}>
          <Text style={s.reportTitle}>{body.subject}</Text>
          <Text style={s.small}>{body.reference}</Text>
        </View>
        <View style={s.grid}>
          {body.refs.map((r) => (
            <View key={r.label} style={s.cell} wrap={false}>
              <Text style={s.th}>{r.label}</Text>
              <Text style={s.td}>
                <Rich text={r.value} />
              </Text>
            </View>
          ))}
        </View>
        {body.blocks.map((b, i) => (
          <Block key={i} b={b} />
        ))}
      </View>
      <Footer body={body} />
    </Page>
  );
}

function Footer({ body, internal }: { body: DocBody; internal?: boolean }) {
  // Absolutely positioned fixed texts (a fixed absolute View does not render in react-pdf 4).
  return (
    <>
      <View style={s.footerRule} fixed />
      <Text style={{ ...s.footerText, left: 25 * MM }} fixed>
        {body.sender.name}, {body.sender.address}
      </Text>
      <Text
        style={{
          ...s.footerText,
          left: 25 * MM,
          right: 20 * MM,
          textAlign: "right",
        }}
        fixed
        render={({ pageNumber, totalPages }) =>
          `${internal ? "Intern – " : ""}${body.form === "report" ? "Bericht" : "Zeichen"} ${body.reference}, Seite ${pageNumber} von ${totalPages}`
        }
      />
    </>
  );
}

function Letter({ body }: { body: DocBody }) {
  const a = body.addressee;
  return (
    <Page size="A4" style={s.page}>
      <View style={s.content}>
        <View style={s.head}>
          <Text style={s.company}>{body.sender.name}</Text>
          <Text style={s.headRight}>
            {body.sender.address}
            {"\n"}Bauleitung
          </Text>
        </View>

        <View style={s.windowRow}>
          <View style={s.window}>
            <Text style={s.returnLine}>
              {body.sender.name}, {body.sender.address}
            </Text>
            {a ? (
              <>
                {a.organisation ? <Text>{a.organisation}</Text> : null}
                <Text>{a.name}</Text>
                {a.address ? (
                  <Text>{a.address.replace(/,\s*(\d{5})/, "\n$1")}</Text>
                ) : null}
              </>
            ) : (
              <Text style={s.missing}>[fehlt: Adressat]</Text>
            )}
          </View>
          <View style={s.info}>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Unser Zeichen</Text>
              <Text>{body.reference}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Datum</Text>
              <Text>{dateDe(body.date)}</Text>
            </View>
            {body.cc.length ? (
              <View style={[s.infoRow, { marginTop: 2 * MM }]}>
                <Text style={s.infoLabel}>Nachrichtlich</Text>
                <Text style={{ flex: 1 }}>
                  {body.cc
                    .map((p) =>
                      [p.name, p.organisation].filter(Boolean).join(", "),
                    )
                    .join("\n")}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text style={s.subject}>{body.subject}</Text>
        <View style={s.refs}>
          {body.refs.map((r) => (
            <View key={r.label} style={s.refRow}>
              <Text style={s.refLabel}>{r.label}</Text>
              <Text style={{ flex: 1 }}>{r.value}</Text>
            </View>
          ))}
        </View>

        <Text style={s.p}>{body.salutation}</Text>
        {body.blocks.map((b, i) => (
          <Block key={i} b={b} />
        ))}
        <View wrap={false} style={{ marginTop: 2 * MM }}>
          <Text>{body.closing}</Text>
          <Text style={{ marginTop: 12 * MM }}>{body.signatory.name}</Text>
          <Text style={s.small}>
            {body.signatory.role}, {body.signatory.company}
          </Text>
        </View>
      </View>
      <Footer body={body} />
    </Page>
  );
}

export type AuditInfo = {
  version: number;
  sha256: string;
  created_at: string;
  author: string | null;
  validated_by: string | null;
  validated_at: string | null;
  sent_at: string | null;
  delivery_status: string | null;
  checks: CheckResult[];
  transcript: {
    role: string;
    text: string;
    text_de: string | null;
    language: string | null;
    at: string;
  }[];
  weather: string | null;
  /** Up to six site photos (JPEG/PNG) as thumbnails (SPEC §6 audit page). */
  photos?: { data: Buffer; format: "jpg" | "png"; at: string; by: string }[];
};

const LIGHT = {
  green: ["Grün", C.green],
  yellow: ["Gelb", C.yellow],
  red: ["Rot", C.red],
} as const;

function AuditPage({ body, audit }: { body: DocBody; audit: AuditInfo }) {
  const rows: [string, string][] = [
    ["Vorgang", body.reference],
    ["Dokument", `${body.subject}, Version ${audit.version}`],
    ["Erstellt", fmtDateTime(audit.created_at)],
    ["Gemeldet von", audit.author ?? "–"],
    [
      "Validiert",
      audit.validated_at
        ? `${fmtDateTime(audit.validated_at)} von ${audit.validated_by ?? "–"}`
        : "noch nicht validiert",
    ],
    [
      "Versendet",
      audit.sent_at
        ? `${fmtDateTime(audit.sent_at)}${audit.delivery_status ? `, Zustellung: ${audit.delivery_status}` : ""}`
        : "noch nicht versendet",
    ],
  ];
  return (
    <Page size="A4" style={s.page}>
      <View style={s.content}>
        <Text style={s.h1}>Interner Prüfbericht</Text>
        <Text style={s.small}>
          Nicht Bestandteil des Schreibens. Wird nicht an Empfänger versendet.
        </Text>
        <Text style={s.marker}>
          {audit.validated_at
            ? "KI-unterstützt erstellt, vom Bauleiter geprüft"
            : "KI-unterstützt erstellt, Prüfung durch den Bauleiter ausstehend"}
        </Text>

        <Text style={s.h2}>Dokument</Text>
        {rows.map(([k, v]) => (
          <View key={k} style={s.factRow}>
            <Text style={s.factLabel}>{k}</Text>
            <Text style={s.factValue}>{v}</Text>
          </View>
        ))}
        <View style={s.factRow}>
          <Text style={s.factLabel}>SHA-256 (Seite 1)</Text>
          <Text style={[s.factValue, s.mono]}>{audit.sha256}</Text>
        </View>

        <Text style={s.h2}>Prüfungen</Text>
        {audit.checks.map((c) => (
          <View key={c.id} style={s.factRow} wrap={false}>
            <Text style={s.factLabel}>{c.label_de}</Text>
            <Text style={s.factValue}>
              <Text
                style={{
                  color: LIGHT[c.light][1],
                  fontFamily: "Helvetica-Bold",
                }}
              >
                {LIGHT[c.light][0]}:{" "}
              </Text>
              {c.reason_de}
            </Text>
          </View>
        ))}

        {audit.weather ? (
          <>
            <Text style={s.h2}>Wetter</Text>
            <Text>{audit.weather}</Text>
          </>
        ) : null}

        {audit.photos?.length ? (
          <>
            <Text style={s.h2}>Fotos von der Baustelle</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {audit.photos.map((p, i) => (
                <View key={i} style={{ width: "31%", marginRight: "2%", marginBottom: 6 }} wrap={false}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt; the caption below names it */}
                  <Image src={{ data: p.data, format: p.format }} style={{ width: "100%", height: 96, objectFit: "cover" }} />
                  <Text style={s.small}>
                    {p.by}, {fmtDateTime(p.at)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {audit.transcript.length ? (
          <>
            <Text style={s.h2}>Gesprächsprotokoll</Text>
            {audit.transcript.map((t, i) => (
              <View key={i} style={s.turn} wrap={false}>
                <Text style={s.small}>
                  {fmtDateTime(t.at)},{" "}
                  {t.role === "user" ? (audit.author ?? "Polier") : "Klara"}
                  {t.language && t.language !== "de"
                    ? ` (${t.language.toUpperCase()})`
                    : ""}
                </Text>
                <Text>{t.text}</Text>
                {t.text_de && t.text_de !== t.text ? (
                  <Text style={s.small}>Deutsch: {t.text_de}</Text>
                ) : null}
              </View>
            ))}
          </>
        ) : null}
      </View>
      <Footer body={body} internal />
    </Page>
  );
}

/** Letter only (email attachment) or letter + internal audit page (download). */
export async function renderPdf(
  body: DocBody,
  audit: AuditInfo | null,
): Promise<Buffer> {
  return renderToBuffer(
    <Document
      title={`${body.subject} – ${body.reference}`}
      author={body.sender.name}
      language="de"
    >
      {body.form === "report" ? <Report body={body} /> : <Letter body={body} />}
      {audit ? <AuditPage body={body} audit={audit} /> : null}
    </Document>,
  );
}
