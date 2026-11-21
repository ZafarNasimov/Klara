// Reference of a team's Bautagesbericht, e.g. "BTB-20261120-ESTRICH" (pure; used by the seed history too).
import type { Team } from "@/lib/types";

export function reportReference(team: Pick<Team, "name">, day: string): string {
  const crew = team.name
    .replace(/^Team\s+/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "SS")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase();
  return `BTB-${day.replaceAll("-", "")}-${crew || "TEAM"}`;
}
