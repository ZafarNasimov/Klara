// LLM extraction for meetings: one forced tool call. Every item must quote the
// transcript verbatim; verifyItems() drops anything that does not.
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { callTool, mainModel } from "@/lib/agent/llm";
import type { ProjectContext } from "@/lib/db/repo";
import { fmtClock, isUncertain, ITEM_KINDS, MEETING_TYPE_DE, segmentDe, type MeetingView, type Segment } from "./model";
import type { RawItem } from "./sample";

const TOOL: Anthropic.Tool = {
  name: "record_meeting",
  description: "Record the summary, decisions, tasks and letter-relevant items of a construction meeting. Every item quotes the German transcript exactly, and the original words.",
  input_schema: {
    type: "object",
    properties: {
      speakers: {
        type: "array",
        description: "Only if speakers are labelled 'Sprecher A', 'Sprecher B' …: who each label is. Use a participant name, or a person addressed or named in the conversation (e.g. the one asked 'Herr Berger, wie sieht es …' and answering). Omit a label if unsure.",
        items: { type: "object", properties: { label: { type: "string" }, name: { type: "string" } }, required: ["label", "name"] },
      },
      summary: { type: "array", items: { type: "string" }, maxItems: 5, description: "At most 5 short German bullets, only facts said in the meeting." },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: [...ITEM_KINDS] },
            text: { type: "string", description: "Short German statement of the item." },
            quote_de: { type: "string", description: "Exact words copied from the GERMAN text of ONE segment (a sentence or clause). Never paraphrase." },
            quote_original: { type: "string", description: "The same passage copied exactly from the ORIGINAL text of that segment (in the language spoken)." },
            segment: { type: "integer", description: "Index of the segment the quote is from." },
            support: { type: "array", items: { type: "integer" }, description: "Other segments that independently state the same fact (optional)." },
            depends_on: { type: "integer", description: "task only: index of a segment whose statement waits for this task (e.g. 'without revision C we cannot start')." },
            trade: { type: "string", description: "Trade concerned, e.g. Elektro, Estrich, Trockenbau." },
            area: { type: "string", description: "Floor/area as said, e.g. '2. OG'." },
            owner: { type: "string", description: "task: who does it (name and role)." },
            due: { type: "string", description: "task: due day exactly as said, e.g. 'Montag', 'heute', '3.12.'." },
            new_end: { type: "string", description: "behinderung/termin: the new end day exactly as said, e.g. 'Freitag'." },
          },
          required: ["kind", "text", "quote_de", "segment"],
        },
      },
    },
    required: ["summary", "items"],
  },
};

const SYSTEM = `You read the transcript of a construction-site meeting (Baubesprechung) in Germany for a contractor (we = the general contractor) and record what it contains. Participants speak different languages; every segment comes with its original text and a German translation, and you work on the German translation. You never invent: if nothing of a kind was said, return no item of that kind.

Item kinds:
- decision: something the meeting agreed or fixed ("wir halten fest", "startet nach …").
- task: someone will do something, with owner and due day as said.
- anordnung: the client (Bauherr) or its representative verbally orders additional or changed work.
- mehrkosten: additional or changed work that costs extra (usually together with an anordnung; same quote).
- behinderung: our work is blocked or delayed by someone else (e.g. a trade hired by the client finishes later). Give trade, area and new_end.
- termin: a trade's schedule date changes (new end day). A late trade usually yields BOTH behinderung and termin with the same quote.
- A dependency on a deliverable that is promised in time (e.g. "without revision C we cannot start" and the plan comes Monday) is NOT a behinderung: record the deliverable as a task with depends_on pointing at the waiting statement.
- mangel: a defect in someone's work was found. Only if actually stated; "keine Mängel" is NOT a mangel.
- bedenken: a concern against the planned execution (§ 4 Abs. 3 VOB/B). Only if stated; a denial is not a concern.

Rules:
- quote_de: copy the exact words from the German text of one segment (a full sentence or clause); do not change spelling or word order. quote_original: the same passage from that segment's original text.
- Segments marked [unsicher] were recognised or translated with low confidence: never base a letter-relevant item (anordnung, mehrkosten, behinderung, termin, mangel, bedenken) on such a segment alone; if another, sure segment states the same, quote the sure one or list it in support.
- Floors are already in German counting in the German text ("2. OG"); use those.
- Dates: give due/new_end exactly as spoken; do not compute dates.
- summary: at most 5 German bullets, plain facts.
- Output German text values (summary, text, owner). Respond only by calling record_meeting.`;

export type LlmExtraction = { summary: string[]; items: RawItem[]; speakers: { label: string; name: string }[] };

export async function extractWithLlm(m: MeetingView, segments: Segment[], ctx: ProjectContext): Promise<LlmExtraction> {
  const header = [
    `Titel: ${m.title}`,
    `Art: ${MEETING_TYPE_DE[m.type]}`,
    `Teilnehmer: ${m.participants.map((p) => `${p.name} – ${p.role}`).join("; ") || "nicht angegeben"}`,
    `Gewerke: ${ctx.trades.map((t) => `${t.name} (${t.contracted_by === "client" ? "vom Bauherrn beauftragt" : "von uns beauftragt"})`).join(", ")}`,
  ].join("\n");
  const lines = segments
    .map((s, i) => {
      const lang = (s.language ?? "de").toUpperCase();
      const flag = isUncertain(s) ? " [unsicher]" : "";
      return s.language && s.language !== "de"
        ? `[${i}] (${fmtClock(s.start_sec)}) ${s.speaker} [${lang}]${flag}\n    Original: ${s.text_original}\n    Deutsch: ${segmentDe(s)}`
        : `[${i}] (${fmtClock(s.start_sec)}) ${s.speaker} [DE]${flag}: ${segmentDe(s)}`;
    })
    .join("\n");
  const call = await callTool<Partial<LlmExtraction>>({
    model: mainModel(),
    system: SYSTEM,
    user: `${header}\n\nTranskript:\n${lines}`,
    tool: TOOL,
    maxTokens: 6000,
    cache: true,
  });
  const input = call.input;
  return {
    summary: Array.isArray(input.summary) ? input.summary.filter((x): x is string => typeof x === "string").slice(0, 5) : [],
    items: Array.isArray(input.items) ? input.items.filter((x) => x && (ITEM_KINDS as string[]).includes(x.kind)) : [],
    speakers: Array.isArray(input.speakers) ? input.speakers : [],
  };
}
