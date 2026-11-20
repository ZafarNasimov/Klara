import type { Contact, Project, Team, Trade } from "@/lib/types";

/** The slice of project data the pure rules engine needs. */
export type RulesCtx = {
  project: Project;
  contacts: Contact[];
  trades: Trade[];
  teams: Team[];
};
