import { handle } from "@/lib/api";
import { DEFAULT_PROJECT_ID, projectNow } from "@/lib/db/repo";
import { checkInbox } from "@/lib/mail/mailbox";

// IMAP login, search and one classification per new reply.
export const maxDuration = 60;

/** Read new client answers from the mailbox (SMTP/IMAP mode). The case page calls this while it waits. */
export async function POST() {
  return handle(async () => checkInbox(await projectNow(DEFAULT_PROJECT_ID)));
}
