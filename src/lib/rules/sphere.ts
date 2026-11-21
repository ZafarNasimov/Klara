// Sphere = whose risk an event is (SPEC §5.2, §7). Deterministic: the LLM only
// names the trade and the kind of cause; project data decides the sphere.
import type { Sphere, Trade } from "@/lib/types";
import type { RulesCtx } from "./context";

/** Multilingual aliases → canonical German trade name (lower-case substrings). */
const TRADE_ALIASES: Record<string, string[]> = {
  Elektro: ["elektr", "electric", "электр", "elektryk", "elektrik", "electrician", "electricien"],
  Trockenbau: ["trockenbau", "drywall", "dry wall", "dry-wall", "гипсокартон", "сухое строительство", "suchą zabudow", "sucha zabudowa", "suchej zabudow", "regips", "alçıpan", "kuru yapı", "rigips", "rigipsuri"],
  Estrich: ["estrich", "screed", "стяжк", "jastrych", "şap", "sapa"],
  Bodenbelag: ["bodenbelag", "floor cover", "flooring", "floor layer", "linoleum", "teppich", "напольн", "покрыти", "posadzk", "wykładzin", "zemin kaplama", "pardoseal"],
  Sanitär: ["sanitär", "plumb", "сантех", "hydraulik", "tesisat", "instalator"],
  Heizung: ["heizung", "heating", "hvac", "отоплен", "ogrzewan", "ısıtma", "încălzire"],
  Fenster: ["fenster", "window", "окн", "okn", "pencere", "ferestre"],
  Maler: ["maler", "painter", "маляр", "malarz", "boyacı", "zugrav"],
  // Not "лес" alone: it is also the start of "лестница" (stairs).
  Gerüstbau: ["gerüst", "scaffold", "леса", "лесов", "rusztowa", "iskele", "schelă", "schela", "schele"],
  Fassade: ["fassade", "facade", "façade", "wdvs", "фасад", "elewac", "cephe", "fațad", "fatad"],
  Rohbau: ["rohbau", "shell work", "concrete", "бетонщик", "монолит", "betoniar", "kaba inşaat", "betoncu", "structur"],
  Abbruch: ["abbruch", "rückbau", "demolition", "демонтаж", "снос", "rozbiór", "wyburz", "yıkım", "demolare"],
  Innenausbau: ["innenausbau", "interior", "отделоч", "wykończeni", "iç mekan", "finisaj"],
};

/** Resolve a free-text trade guess ("electricians", "электрики") to a project trade. */
export function resolveTrade(guess: string | null | undefined, trades: Trade[]): Trade | null {
  if (!guess) return null;
  const g = guess.toLowerCase().trim();
  const exact = trades.find((t) => t.name.toLowerCase() === g);
  if (exact) return exact;
  for (const t of trades) {
    const aliases = TRADE_ALIASES[t.name] ?? [t.name.toLowerCase()];
    if (aliases.some((a) => g.includes(a))) return t;
  }
  return null;
}

/** Canonical German trade name for a guess, even if the trade is not in the project. */
export function canonicalTradeName(guess: string | null | undefined): string | null {
  if (!guess) return null;
  const g = guess.toLowerCase().trim();
  for (const [name, aliases] of Object.entries(TRADE_ALIASES)) {
    if (name.toLowerCase() === g || aliases.some((a) => g.includes(a))) return name;
  }
  return guess.trim();
}

/**
 * Kind of cause as read by the LLM:
 * trade = another trade blocks us; client_provision = plans, decisions, access or
 * material the client owes; weather; own = our own crew or equipment; other/unknown.
 */
export type CauseKind = "trade" | "client_provision" | "weather" | "own" | "other" | "unknown";

export type SphereInput = {
  causeKind: CauseKind;
  tradeGuess: string | null;
  /** Answer to "Who hired the <trade>?" / "Who is responsible?" */
  hiredBy?: "client" | "us" | null;
  /** The team reporting the event (its own trade is our own sphere). */
  reportingTeamId?: string | null;
};

export type SphereResult = { sphere: Sphere; trade: Trade | null; tradeName: string | null };

export function computeSphere(input: SphereInput, ctx: RulesCtx): SphereResult {
  const trade = resolveTrade(input.tradeGuess, ctx.trades);
  const tradeName = trade?.name ?? canonicalTradeName(input.tradeGuess);
  if (input.causeKind === "weather") return { sphere: "weather", trade: null, tradeName: null };
  if (input.causeKind === "client_provision") return { sphere: "client", trade, tradeName };
  if (input.causeKind === "own") return { sphere: "own_team", trade, tradeName };
  if (trade) {
    if (trade.team_id && trade.team_id === input.reportingTeamId) return { sphere: "own_team", trade, tradeName };
    if (trade.contracted_by === "client") return { sphere: "client", trade, tradeName };
    return { sphere: trade.team_id ? "own_team" : "own_sub", trade, tradeName };
  }
  if (input.hiredBy === "client") return { sphere: "client", trade: null, tradeName };
  if (input.hiredBy === "us") return { sphere: tradeName ? "own_sub" : "own_team", trade: null, tradeName };
  return { sphere: "unclear", trade: null, tradeName };
}

/**
 * Routing of a reported hindrance (SPEC §5.2):
 * client → Behinderungsanzeige; weather → Behinderungsanzeige, time only, no cost reservation;
 * own_sub → Abhilfeaufforderung an NU + internal risk; own_team → diary + internal risk, no letter;
 * unclear → ask who hired the trade.
 */
export type HindranceRoute =
  | { kind: "letter"; doc_type: "behinderungsanzeige"; cost_reservation: boolean }
  | { kind: "letter"; doc_type: "verzug_nu"; internal_risk: true }
  | { kind: "diary"; internal_risk: true }
  | { kind: "ask_sphere"; trade: string | null };

export function routeHindrance(sphere: Sphere, tradeName: string | null): HindranceRoute {
  switch (sphere) {
    case "client":
      return { kind: "letter", doc_type: "behinderungsanzeige", cost_reservation: true };
    case "weather":
      return { kind: "letter", doc_type: "behinderungsanzeige", cost_reservation: false };
    case "own_sub":
      return { kind: "letter", doc_type: "verzug_nu", internal_risk: true };
    case "own_team":
      return { kind: "diary", internal_risk: true };
    case "unclear":
      return { kind: "ask_sphere", trade: tradeName };
  }
}
