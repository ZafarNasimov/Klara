// Letters from confirmed cases: fixed German text, hash, versions, PDF + DOCX.
import { beforeEach, describe, expect, it } from "vitest";
import { runTurn } from "@/lib/agent/turn";
import { store } from "@/lib/db";
import { createConversation, listCases, listDocumentVersions } from "@/lib/db/repo";
import { buildSeed, IDS } from "@/lib/db/seed";
import { berlinTime } from "@/lib/deadlines";
import type { Case } from "@/lib/types";
import { renderDocx } from "./docx";
import { generateDocument, sha256 } from "./generate";
import { renderPdf } from "./pdf";
import type { DocBody } from "./types";

const DAY = "2026-11-20";
let clock = berlinTime(DAY, 9, 30);
const tick = () => (clock = new Date(clock.getTime() + 60_000));

async function talk(lines: string[], team = IDS.teamEstrich) {
  const user = team === IDS.teamEstrich ? IDS.userPolierEstrich : IDS.userPolierAusbau;
  const conv = await createConversation({ team_id: team, user_id: user, kind: "chat" }, clock);
  for (const text of lines) await runTurn({ conversationId: conv.id, text, now: tick() });
  return (await listCases(IDS.project)).filter((c) => c.status !== "entwurf");
}

async function letter(c: Case) {
  const [v] = await listDocumentVersions(c.id);
  return { v, body: v.body as DocBody, md: v.body_md };
}

beforeEach(async () => {
  clock = berlinTime(DAY, 9, 30);
  await store().reset(buildSeed(clock));
});

describe("Behinderungsanzeige", () => {
  it("is generated on confirmation with the fixed text, the client as addressee and a hash", async () => {
    const [c] = await talk([
      "The electricians haven't cleared the second floor. Our screed crew has been standing since seven, four people waiting.",
      "About two days.",
      "Yes.",
    ]);
    const { v, body, md } = await letter(c);
    expect(v.version).toBe(1);
    expect(v.sha256).toBe(sha256(md));
    expect(body.subject).toBe("Behinderungsanzeige gemäß § 6 Abs. 1 VOB/B");
    expect(body.addressee).toMatchObject({ name: "Dr. Petra Lang", organisation: "Immobilien Isar GmbH" });
    expect(body.missing).toEqual([]);
    expect(md).toContain("**Beginn der Behinderung:** 20.11.2026, 07:00 Uhr");
    expect(md).toContain("Derzeit sind 4 Arbeitskräfte ohne Einsatzmöglichkeit.");
    expect(md).toContain("Unser Zeichen: KL-2026-0042");
    expect(md).toContain("insbesondere nach § 6 Abs. 6 VOB/B und § 642 BGB");

    const pdf = await renderPdf(body, null);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const docx = await renderDocx(body);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
  });

  it("has no cost reservation for weather", async () => {
    await talk(["Sturm, der Kran stand den ganzen Tag.", "seit 7 Uhr", "2.OG", "4 Leute", "ja"]);
    const c = (await listCases(IDS.project)).find((x) => x.doc_type === "behinderungsanzeige")!;
    const { md } = await letter(c);
    expect(md).not.toContain("§ 6 Abs. 6");
    expect(md).toContain("Witterungsverhältnissen");
  });

  it("marks missing required facts instead of inventing them", async () => {
    const [c] = await talk(["Die Elektriker blockieren das 2.OG.", "weiß ich nicht", "weiß ich nicht", "weiß ich nicht", "ja"]);
    const { body, md } = await letter(c);
    expect(c.status).toBe("unvollstaendig");
    expect(body.missing.length).toBeGreaterThan(0);
    expect(md).toMatch(/\[fehlt: [^\]]+\]/);
  });
});

describe("verbal instruction", () => {
  it("never claims 'before execution' when the work has started, and links the pair", async () => {
    const cases = await talk([
      "Architekt Weber hat heute gesagt: 3 zusätzliche Brandschutztüren im 2.OG.",
      "Ja, wir haben schon begonnen.",
      "Montag",
      "ja",
    ]);
    const mk = cases.find((c) => c.doc_type === "mehrkostenanzeige")!;
    const ab = cases.find((c) => c.doc_type === "anordnung_bestaetigung")!;
    const m = await letter(mk);
    expect(m.md).not.toContain("vor Beginn der Ausführung");
    expect(m.body.cc.map((p) => p.name)).toContain("Thomas Weber");
    const a = await letter(ab);
    expect(a.md).toContain(`(Zeichen ${mk.reference})`);
    expect(a.md).toContain("„Lieferung und Einbau von 3 zusätzlichen Brandschutztüren im 2.OG“");
  });
});

describe("versions", () => {
  it("does not change a sent letter", async () => {
    const [c] = await talk([
      "The electricians haven't cleared the second floor. Our screed crew has been standing since seven, four people waiting.",
      "About two days.",
      "Yes.",
    ]);
    const { v } = await letter(c);
    await store().update("document_version", v.id, { immutable: true, sent_at: clock.toISOString() });
    await expect(generateDocument(c.id, tick())).rejects.toThrow(/unveränderlich|nicht mehr geändert/);
  });

  it("returns the same version when nothing changed", async () => {
    const [c] = await talk([
      "The electricians haven't cleared the second floor. Our screed crew has been standing since seven, four people waiting.",
      "About two days.",
      "Yes.",
    ]);
    const again = await generateDocument(c.id, clock);
    expect(again?.version).toBe(1);
    expect(await listDocumentVersions(c.id)).toHaveLength(1);
  });
});
