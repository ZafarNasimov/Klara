// The demo data of "Demo zurücksetzen": three sites, six teams, three weeks of history.
import { beforeEach, describe, expect, it } from "vitest";
import { runTurn } from "@/lib/agent/turn";
import { LINES } from "@/lib/agent/lines";
import { caseDetail } from "@/lib/cases/detail";
import { store } from "@/lib/db";
import { createConversation, getProjectContext, listCases, listDocumentVersions, nextReference, toCaseViews } from "@/lib/db/repo";
import { buildSeed, IDS } from "@/lib/db/seed";
import { berlinTime } from "@/lib/deadlines";
import { auditInfo } from "@/lib/documents/generate";
import { renderPdf } from "@/lib/documents/pdf";
import { withDemoHistory } from "./demo-history";

const NOW = berlinTime("2026-11-20", 9, 30);

beforeEach(async () => {
  await store().reset(withDemoHistory(buildSeed(NOW), NOW));
});

describe("demo data", () => {
  it("has three sites with teams in six languages Klara speaks", async () => {
    const projects = await store().list("project");
    expect(projects.map((p) => p.name).sort()).toEqual(["Neubau Bürogebäude Schwabing", "Schule Pasing", "Wohnanlage Riem, Haus 2"]);
    expect(projects.find((p) => p.id === IDS.projectSchwabing)?.contract_type).toBe("BGB");
    const users = await store().list("app_user");
    const langs = new Set<string>();
    for (const t of await store().list("team")) {
      const lead = users.find((u) => u.id === t.lead_user_id)!;
      expect(LINES[lead.language], `${t.name}: ${lead.language}`).toBeDefined();
      langs.add(lead.language);
    }
    expect([...langs].sort()).toEqual(["de", "en", "pl", "ro", "ru", "tr"]);
  });

  it("keeps the live demo's case at KL-2026-0042", async () => {
    const refs = (await store().list("case")).map((c) => c.reference);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs.filter((r) => r.startsWith("KL-")).sort()).toEqual(Array.from({ length: 11 }, (_, i) => `KL-2026-${String(31 + i).padStart(4, "0")}`));
    expect(await nextReference(IDS.project, NOW)).toBe("KL-2026-0042");
    const conv = await createConversation({ team_id: IDS.teamEstrich, user_id: IDS.userPolierEstrich, kind: "chat" }, NOW);
    await runTurn({ conversationId: conv.id, text: "Die Elektriker haben das 2.OG nicht freigegeben, 4 Leute stehen seit 7 Uhr.", now: new Date(NOW.getTime() + 60_000) });
    expect((await listCases(IDS.project)).find((c) => c.status === "entwurf")?.reference).toBe("KL-2026-0042");
  });

  it("opens every case page and renders every letter", async () => {
    for (const p of await store().list("project")) {
      const ctx = await getProjectContext(p.id);
      const cases = await listCases(p.id);
      expect(cases.length, p.name).toBeGreaterThanOrEqual(4);
      await toCaseViews(cases, ctx);
      for (const c of cases) {
        const d = await caseDetail(c.id);
        expect(d.versions.length, c.reference).toBeGreaterThan(0);
        const [v] = await listDocumentVersions(c.id);
        const { body, audit } = await auditInfo(v);
        expect((await renderPdf(body, audit)).subarray(0, 4).toString(), c.reference).toBe("%PDF");
      }
    }
  });

  it("tells the story: rejection → Stellungnahme, question → Ergänzung, sent letters immutable", async () => {
    const all = await store().list("case");
    const byRef = (r: string) => all.find((c) => c.reference === r)!;
    const d36 = await caseDetail(byRef("KL-2026-0036").id);
    expect(d36.replies[0].classification).toMatchObject({ kind: "rejection" });
    expect(d36.children.map((c) => c.reference)).toEqual(["KL-2026-0037", "KL-2026-0040"]);
    expect(d36.case.checks.find((x) => x.id === "channel")?.light).toBe("green");
    const d39 = await caseDetail(byRef("KL-2026-0039").id);
    expect(d39.case.facts._reply_email_id).toBe((await caseDetail(byRef("KL-2026-0038").id)).replies[0].id);
    for (const m of await store().list("email_out")) {
      const v = (await store().get("document_version", m.document_version_id!))!;
      expect(v).toMatchObject({ immutable: true, sent_at: m.sent_at });
    }
    expect(byRef("KL-2026-0041")).toMatchObject({ doc_type: "meldung", status: "bereit" });
  });
});
