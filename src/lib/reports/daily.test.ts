// Bautagesbericht: compiled from the evening quantities and the day's cases.
import { beforeEach, describe, expect, it } from "vitest";
import { runTurn } from "@/lib/agent/turn";
import { store } from "@/lib/db";
import { createConversation, listCases, listDocumentVersions, updateCase } from "@/lib/db/repo";
import { buildSeed, IDS } from "@/lib/db/seed";
import { berlinTime } from "@/lib/deadlines";
import { renderDocx } from "@/lib/documents/docx";
import { renderPdf } from "@/lib/documents/pdf";
import { staffRows } from "@/lib/documents/templates/bautagesbericht";
import type { DocBody } from "@/lib/documents/types";
import { compileDailyReport, findDailyReportCase, reportReference } from "./daily";

const DAY = "2026-11-20";
let clock = berlinTime(DAY, 9, 30);
const tick = () => (clock = new Date(clock.getTime() + 60_000));

async function chat() {
  const conv = await createConversation({ team_id: IDS.teamEstrich, user_id: IDS.userPolierEstrich, kind: "chat" }, clock);
  return (text: string) => runTurn({ conversationId: conv.id, text, now: tick() });
}

beforeEach(async () => {
  clock = berlinTime(DAY, 9, 30);
  await store().reset(buildSeed(clock));
});

describe("Bautagesbericht", () => {
  it("is written from the evening quantity and lists the day's hindrance", async () => {
    const say = await chat();
    await say("The electricians haven't cleared the second floor. Our screed crew has been standing since seven, four people waiting.");
    await say("About two days.");
    await say("Yes.");
    clock = berlinTime(DAY, 16, 0);
    const r = await say("Estrich 2.OG heute nur 15 m²");

    const report = r.cases.find((c) => c.doc_type === "bautagesbericht")!;
    expect(report).toMatchObject({ reference: "BTB-20261120-ESTRICH", status: "unvollstaendig", missing_fields: ["staff"] });
    expect(report.facts._progress).toEqual([{ label: "Estrich 2.OG", qty: 15, unit: "m²", planned: 40 }]);
    expect(report.facts._incidents).toEqual([
      expect.stringMatching(/^Behinderungsanzeige KL-2026-0042: Die Elektroarbeiten im 2\.OG/),
      expect.stringMatching(/^Information an Folgegewerk \(Terminverschiebung\) KL-2026-0043: Bodenbelag .+, voraussichtlich ca\. \d+ Arbeitstage Verzug$/),
    ]);

    const [v] = await listDocumentVersions(report.id);
    const body = v.body as DocBody;
    expect(body).toMatchObject({ form: "report", subject: "Bautagesbericht vom 20.11.2026", addressee: null, salutation: "" });
    expect(body.refs).toContainEqual({ label: "Berichtstag", value: "Freitag, 20.11.2026" });
    expect(v.body_md).toContain("| Estrich 2.OG | 15 m² | 40 m² | 38 % |");
    expect(v.body_md).toContain("[fehlt: Personal]");
    expect(v.body_md).toContain("Polier: Sergej Iwanow");
  });

  it("asks the crew in the chat and completes the report on the yes", async () => {
    const say = await chat();
    clock = berlinTime(DAY, 16, 0);
    const r1 = await say("Estrich 2.OG heute 40 m²");
    expect(r1.reply).toMatch(/Wie viele Leute waren heute da, Polier, Facharbeiter, Helfer\?$/);
    const report = r1.cases.find((c) => c.doc_type === "bautagesbericht")!;
    expect(report.flags).toContain("collecting");

    const r2 = await say("1 Polier, 3 Facharbeiter, 1 Helfer");
    expect(r2.awaiting_confirm).toBe(true);
    await say("Ja.");
    const done = (await findDailyReportCase(IDS.teamEstrich, DAY))!;
    expect(done).toMatchObject({ status: "bereit", missing_fields: [] });
    expect(done.flags).not.toContain("collecting");
    const [v] = await listDocumentVersions(done.id);
    expect(v.version).toBe(2);
    expect(v.body_md).toContain("| Facharbeiter | 3 |");
  });

  it("keeps what the Polier added and makes a new version", async () => {
    const say = await chat();
    clock = berlinTime(DAY, 16, 0);
    await say("Estrich 2.OG heute 40 m²");
    const first = (await findDailyReportCase(IDS.teamEstrich, DAY))!;
    await updateCase(first.id, { facts: { ...first.facts, staff: "1 Polier, 3 Facharbeiter, 1 Helfer" } }, tick());

    const again = await compileDailyReport(IDS.teamEstrich, DAY, tick());
    expect(again.id).toBe(first.id);
    expect(again).toMatchObject({ status: "bereit", missing_fields: [] });
    expect(again.facts.staff).toBe("1 Polier, 3 Facharbeiter, 1 Helfer");
    const versions = await listDocumentVersions(first.id);
    expect(versions.map((x) => x.version)).toEqual([2, 1]);
    expect(versions[0].body_md).toContain("| Gesamt | 5 |");
    expect((await listCases(IDS.project)).filter((c) => c.doc_type === "bautagesbericht")).toHaveLength(1);
  });

  it("renders as PDF and Word", async () => {
    const say = await chat();
    clock = berlinTime(DAY, 16, 0);
    await say("Estrich 2.OG heute nur 15 m²");
    const report = (await findDailyReportCase(IDS.teamEstrich, DAY))!;
    const [v] = await listDocumentVersions(report.id);
    const pdf = await renderPdf(v.body as DocBody, null);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const docx = await renderDocx(v.body as DocBody);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
  });
});

describe("helpers", () => {
  it("reads crew counts and builds the reference", () => {
    expect(staffRows("1 Polier, 3 Facharbeiter und 1 Helfer")).toEqual([
      ["Polier", "1"],
      ["Facharbeiter", "3"],
      ["Helfer", "1"],
    ]);
    expect(staffRows("die ganze Kolonne")).toBeNull();
    expect(reportReference({ name: "Team Ausbau Süd" }, "2026-11-20")).toBe("BTB-20261120-AUSBAUSUD");
  });
});
