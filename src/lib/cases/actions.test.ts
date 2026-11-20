// Office actions: validate a letter, send a case back to the Polier and get it confirmed again.
import { beforeEach, describe, expect, it } from "vitest";
import { runTurn } from "@/lib/agent/turn";
import { store } from "@/lib/db";
import { createConversation, listCases, listDocumentVersions, listEvents, listTurns } from "@/lib/db/repo";
import { buildSeed, IDS } from "@/lib/db/seed";
import { berlinTime } from "@/lib/deadlines";
import { returnForCompletion, validateCase, validationBlocker } from "./actions";

const DAY = "2026-11-20";
let clock = berlinTime(DAY, 9, 30);
const tick = () => (clock = new Date(clock.getTime() + 60_000));

async function goldenPath() {
  const conv = await createConversation({ team_id: IDS.teamEstrich, user_id: IDS.userPolierEstrich, kind: "chat" }, clock);
  const say = (text: string) => runTurn({ conversationId: conv.id, text, now: tick() });
  await say("The electricians haven't cleared the second floor. Our screed crew has been standing since seven, four people waiting.");
  await say("About two days.");
  await say("Yes.");
  const [c] = (await listCases(IDS.project)).filter((x) => x.status !== "entwurf");
  return { c, conv, say };
}

beforeEach(async () => {
  clock = berlinTime(DAY, 9, 30);
  await store().reset(buildSeed(clock));
});

describe("validate", () => {
  it("lets the Bauleiter approve the current version", async () => {
    const { c } = await goldenPath();
    expect(validationBlocker(c)).toBeNull();
    const r = await validateCase(c.id, IDS.userBauleiter, tick());
    expect(r.case.status).toBe("validiert");
    expect(r.version).toMatchObject({ version: 1, validated_by: IDS.userBauleiter });
    expect((await listEvents({ caseId: c.id })).map((e) => e.kind)).toContain("case_validated");
    await expect(validateCase(c.id, IDS.userBauleiter, tick())).rejects.toThrow("bereits validiert");
  });

  it("is only for the Bauleitung", async () => {
    const { c } = await goldenPath();
    await expect(validateCase(c.id, IDS.userPolierEstrich, tick())).rejects.toThrow("Nur die Bauleitung");
  });
});

describe("return for completion", () => {
  it("asks the Polier in the chat's language and takes the answer into a new version", async () => {
    const { c, conv, say } = await goldenPath();
    await validateCase(c.id, IDS.userBauleiter, tick());

    const back = await returnForCompletion(c.id, { field: "idle_equipment", user_id: IDS.userBauleiter }, tick());
    expect(back).toMatchObject({ status: "unvollstaendig", flags: expect.arrayContaining(["returned"]) });
    expect(validationBlocker(back)).toBe("Liegt zur Ergänzung beim Polier.");
    const ask = (await listTurns(conv.id)).at(-1)!;
    expect(ask).toMatchObject({ role: "klara", language: "en" });
    expect(ask.text_original).toMatch(/^The site manager needs more information for Hindrance notice KL-2026-0042\./);
    expect(ask.text_de).toMatch(/^Die Bauleitung braucht noch eine Angabe zu Behinderungsanzeige KL-2026-0042\./);

    const r1 = await say("An excavator is standing idle.");
    expect(r1.awaiting_confirm).toBe(true);
    const r2 = await say("Yes.");
    expect(r2.reply).toMatch(/^Thank you\./);
    const [after] = (await listCases(IDS.project)).filter((x) => x.id === c.id);
    expect(after.status).toBe("bereit");
    expect(after.flags).not.toContain("returned");
    expect(after.facts.idle_equipment).toBeTruthy();
    expect((await listDocumentVersions(c.id)).map((v) => v.version)).toEqual([2, 1]);
  });

  it("needs a field or a note", async () => {
    const { c } = await goldenPath();
    await expect(returnForCompletion(c.id, {}, tick())).rejects.toThrow("Bitte eine Angabe");
  });
});
