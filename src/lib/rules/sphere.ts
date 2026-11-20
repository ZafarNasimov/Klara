// Sphere = whose risk an event is (SPEC §5.2, §7). Deterministic: the LLM only
// guesses the trade name; code decides the sphere from project data.
import type { Sphere, Trade } from "@/lib/types";
import type { RulesCtx } from "./context";

/** Multilingual aliases → canonical German trade name. Lower-case substrings. */
const TRADE_ALIASES: Record<string, string[]> = {
  Elektro: ["elektr", "electric", "электр", "elektryk", "elektrik", "electrician"],
  Trockenbau: ["trockenbau", "drywall", "dry wall", "гипсокартон", "сухое строительство", "suchą zabudow", "sucha zabudowa", "alçıpan", "kuru yapı", "regips"],
  Estrich: ["estrich", "screed", "стяжк", "jastrych", "şap"],
  Bodenbelag: ["bodenbelag", "floor cover", "flooring", "linoleum", "напольн", "posadzk", "wykładzin", "zemin kaplama"],
  Sanitär: ["sanitär", "plumb", "сантех", "hydraulik", "tesisat"],
  Heizung: ["heizung", "heating", "отоплен", "ogrzewan", "ısıtma"],
};

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
  const g = guess.toLowerCase();
  for (const [name, aliases] of Object.entries(TRADE_ALIASES)) {
    if (name.toLowerCase() === g || aliases.some((a) => g.includes(a))) return name;
  }
  return guess;
}

export type SphereInput = {
  causeKind: "trade" | "weather" | "other" | "unknown";
  tradeGuess: string | null;
  /** Answer to "Who hired the <trade>?" */
  hiredBy?: "client" | "us" | null;
};

export type SphereResult = {
  sphere: Sphere;
  trade: Trade | null;
  tradeName: string | null;
};

export function computeSphere(input: SphereInput, ctx: RulesCtx): SphereResult {
  if (input.causeKind === "weather") return { sphere: "weather", trade: null, tradeName: null };
  const trade = resolveTrade(input.tradeGuess, ctx.trades);
  const tradeName = trade?.name ?? canonicalTradeName(input.tradeGuess);
  if (trade) {
    if (trade.contracted_by === "client") return { sphere: "client", trade, tradeName };
    return { sphere: trade.team_id ? "own_team" : "own_sub", trade, tradeName };
  }
  if (input.hiredBy === "client") return { sphere: "client", trade: null, tradeName };
  if (input.hiredBy === "us") return { sphere: "own_sub", trade: null, tradeName };
  return { sphere: "unclear", trade: null, tradeName };
}

/**
 * Routing for a reported hindrance (SPEC §5.2):
 * client → Behinderungsanzeige; weather → Behinderungsanzeige (time only);
 * own_sub → verzug_nu + internal risk; own_team → diary + internal risk, no letter;
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
