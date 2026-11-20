// Server-side PDF (SPEC §2: @react-pdf/renderer). Page 1 = letter, page 2 =
// internal audit page (only when requested; not attached to outgoing mail).
import "server-only";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { AuditData, DocBody, Party } from "./model";

// No automatic hyphenation: hashes and references must stay intact.
Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 64, fontSize: 10.5, fontFamily: "Helvetica", color: "#18181b", lineHeight: 1.45 },
  letterhead: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#e4e4e7", paddingBottom: 10, marginBottom: 22 },
  company: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  small: { fontSize: 8.5, color: "#52525b" },
  addressee: { marginBottom: 22, minHeight: 60 },
  date: { textAlign: "right", marginBottom: 18 },
  title: { fontSize: 12.5, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  subject: { marginBottom: 16, color: "#3f3f46" },
  p: { marginBottom: 9 },
  quote: { marginBottom: 9, marginLeft: 14, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: "#d4d4d8", fontFamily: "Helvetica-Oblique" },
  fieldRow: { flexDirection: "row", marginBottom: 3 },
  fieldKey: { width: 150, fontFamily: "Helvetica-Bold" },
  fieldVal: { flex: 1 },
  bullet: { flexDirection: "row", marginBottom: 3, paddingLeft: 6 },
  footer: { position: "absolute", bottom: 26, left: 64, right: 64, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#71717a" },
  mono: { fontFamily: "Courier", fontSize: 8.5 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  h3: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 4 },
  marker: { padding: 6, borderWidth: 1, borderColor: "#e4e4e7", marginBottom: 10 },
});

const lines = (p: Party) => [p.organisation, p.name, p.address].filter(Boolean) as string[];

function Letter({ b }: { b: DocBody }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.letterhead} fixed>
        <Text style={s.company}>{b.sender.company}</Text>
        <Text style={s.small}>{b.sender.address}</Text>
      </View>
      <View style={s.addressee}>
        <Text style={s.small}>{`${b.sender.company} · ${b.sender.address}`}</Text>
        {b.addressee && lines(b.addressee).map((l, i) => <Text key={i}>{l}</Text>)}
        {b.cc.length > 0 && (
          <Text style={[s.small, { marginTop: 6 }]}>
            {`Kopie: ${b.cc.map((c) => [c.name, c.organisation].filter(Boolean).join(", ")).join("; ")}`}
          </Text>
        )}
      </View>
      <Text style={s.date}>{b.place_date}</Text>
      <Text style={s.title}>{b.title}</Text>
      <View style={s.subject}>
        {b.subject_lines.map((l, i) => (
          <Text key={i}>{l}</Text>
        ))}
      </View>
      {b.salutation ? <Text style={s.p}>{b.salutation}</Text> : null}
      {b.blocks.map((block, i) => {
        switch (block.type) {
          case "p":
            return (
              <Text key={i} style={s.p}>
                {block.text}
              </Text>
            );
          case "quote":
            return (
              <Text key={i} style={s.quote}>
                {block.text}
              </Text>
            );
          case "bullets":
            return (
              <View key={i} style={{ marginBottom: 9 }}>
                {block.items.map((it, j) => (
                  <View key={j} style={s.bullet}>
                    <Text style={{ width: 10 }}>–</Text>
                    <Text style={{ flex: 1 }}>{it}</Text>
                  </View>
                ))}
              </View>
            );
          case "fields":
            return (
              <View key={i} style={{ marginBottom: 9 }}>
                {block.rows.map(([k, v], j) => (
                  <View key={j} style={s.fieldRow}>
                    <Text style={s.fieldKey}>{k}:</Text>
                    <Text style={s.fieldVal}>{v}</Text>
                  </View>
                ))}
              </View>
            );
        }
      })}
      <View wrap={false} style={{ marginTop: 10 }}>
        <Text>{b.closing}</Text>
        <Text style={{ marginTop: 26 }}>{b.signatory.name}</Text>
        <Text style={s.small}>{b.signatory.role}</Text>
      </View>
      <View style={s.footer} fixed>
        <Text>{`Zeichen ${b.reference}`}</Text>
        <Text render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
      </View>
    </Page>
  );
}

function Audit({ a, b }: { a: AuditData; b: DocBody }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>Interne Prüfseite – nicht zum Versand</Text>
      <Text style={s.marker}>{a.marker}</Text>
      <View style={s.fieldRow}>
        <Text style={s.fieldKey}>SHA-256 Seite 1:</Text>
        <Text style={[s.fieldVal, s.mono]}>{a.sha256}</Text>
      </View>
      <View style={s.fieldRow}>
        <Text style={s.fieldKey}>Version:</Text>
        <Text style={s.fieldVal}>{String(a.version)}</Text>
      </View>
      {a.timestamps.map(([k, v], i) => (
        <View key={i} style={s.fieldRow}>
          <Text style={s.fieldKey}>{k}:</Text>
          <Text style={s.fieldVal}>{v}</Text>
        </View>
      ))}
      <View style={s.fieldRow}>
        <Text style={s.fieldKey}>Geprüft durch:</Text>
        <Text style={s.fieldVal}>{a.validated_by ? `${a.validated_by}, ${a.validated_at}` : "noch nicht validiert"}</Text>
      </View>
      {a.weather && (
        <View style={s.fieldRow}>
          <Text style={s.fieldKey}>Wetter:</Text>
          <Text style={s.fieldVal}>{a.weather}</Text>
        </View>
      )}
      <Text style={s.h3}>Gesprächsprotokoll (Original und Deutsch)</Text>
      {a.transcript.length === 0 && <Text style={s.small}>Kein Gespräch hinterlegt.</Text>}
      {a.transcript.map((t, i) => (
        <View key={i} style={{ marginBottom: 4 }}>
          <Text>
            <Text style={s.mono}>{t.at} </Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{t.role === "user" ? "Meldung: " : "Klara: "}</Text>
            {t.text}
          </Text>
          {t.text_de && t.text_de !== t.text && <Text style={s.small}>{`DE: ${t.text_de}`}</Text>}
        </View>
      ))}
      {a.photos.length > 0 && (
        <>
          <Text style={s.h3}>Fotos</Text>
          {a.photos.map((p, i) => (
            <Text key={i} style={s.small}>
              {p}
            </Text>
          ))}
        </>
      )}
      <View style={s.footer} fixed>
        <Text>{`Zeichen ${b.reference} – intern`}</Text>
        <Text render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
      </View>
    </Page>
  );
}

export async function renderPdf(body: DocBody, audit?: AuditData | null): Promise<Buffer> {
  return renderToBuffer(
    <Document title={`${body.title} – ${body.reference}`} author={body.sender.company} language="de">
      <Letter b={body} />
      {audit ? <Audit a={audit} b={body} /> : null}
    </Document>,
  );
}
