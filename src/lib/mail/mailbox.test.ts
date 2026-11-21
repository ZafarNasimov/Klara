// Mailbox mode (SMTP send, IMAP replies): settings, transport choice, quote stripping.
import { afterEach, describe, expect, it } from "vitest";
import { classifyByKeywords, stripQuoted, verbatimQuote } from "./classify";
import { mailDelivery, mailFrom } from "./delivery";
import { mailboxConfig } from "./mailbox";

const KEYS = ["MAIL_USER", "MAIL_PASSWORD", "MAIL_FROM_NAME", "MAIL_SMTP_HOST", "MAIL_IMAP_HOST", "POSTMARK_SERVER_TOKEN", "POSTMARK_FROM"];
afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("mailbox settings", () => {
  it("is off without user and password", () => {
    expect(mailboxConfig()).toBeNull();
    expect(mailDelivery()).toBe("simulated");
  });

  it("knows Gmail's servers and drops the spaces Google shows in app passwords", () => {
    process.env.MAIL_USER = "musterbau.bauleitung@gmail.com";
    process.env.MAIL_PASSWORD = "abcd efgh ijkl mnop";
    process.env.MAIL_FROM_NAME = "Markus Hofmann, Bauleitung Muster Bau GmbH";
    expect(mailboxConfig()).toMatchObject({
      pass: "abcdefghijklmnop",
      smtp: { host: "smtp.gmail.com", port: 465 },
      imap: { host: "imap.gmail.com", port: 993 },
    });
    expect(mailFrom()).toBe("Markus Hofmann, Bauleitung Muster Bau GmbH <musterbau.bauleitung@gmail.com>");
  });

  it("needs hosts for other providers, and wins over Postmark when set", () => {
    process.env.MAIL_USER = "bauleitung@muster-bau.example";
    process.env.MAIL_PASSWORD = "geheim";
    process.env.POSTMARK_SERVER_TOKEN = "pm-token";
    expect(mailboxConfig()).toBeNull();
    expect(mailDelivery()).toBe("postmark");
    process.env.MAIL_SMTP_HOST = "smtp.ionos.de";
    process.env.MAIL_IMAP_HOST = "imap.ionos.de";
    expect(mailDelivery()).toBe("smtp");
  });
});

describe("reply text from a real mailbox", () => {
  const gmailDe = [
    "Sehr geehrte Damen und Herren,",
    "",
    "wir weisen Ihre Behinderungsanzeige vom 21.11.2026 zurück. Die Elektroarbeiten liegen im Zeitplan.",
    "",
    "Mit freundlichen Grüßen",
    "Petra Lang",
    "",
    "Am Fr., 21. Nov. 2026 um 09:41 Uhr schrieb Markus Hofmann, Bauleitung Muster Bau GmbH <",
    "musterbau.bauleitung@gmail.com>:",
    "",
    "> Sehr geehrte Damen und Herren,",
    "> anbei erhalten Sie unser Schreiben „Behinderungsanzeige“ … Wir bitten um eine kurze Eingangsbestätigung.",
  ].join("\n");

  it("keeps only the new part (Gmail, German)", () => {
    const t = stripQuoted(gmailDe);
    expect(t).toContain("Die Elektroarbeiten liegen im Zeitplan.");
    expect(t).not.toContain("Eingangsbestätigung");
    // Our own "please confirm receipt" in the quote must not turn a rejection into an acceptance.
    expect(classifyByKeywords("AW: Behinderungsanzeige", gmailDe).kind).toBe("rejection");
    expect(verbatimQuote("Die Elektroarbeiten liegen im Zeitplan", gmailDe)).toBe("Die Elektroarbeiten liegen im Zeitplan.");
  });

  it("cuts Outlook and English quote headers", () => {
    expect(stripQuoted("Wir bestätigen den Eingang.\r\n\r\nVon: Markus Hofmann\r\nGesendet: Freitag\r\nBetreff: Behinderungsanzeige")).toBe(
      "Wir bestätigen den Eingang.",
    );
    expect(stripQuoted("We reject your notice.\n\nOn Fri, Nov 21, 2026 at 9:41 AM Markus Hofmann <\nmusterbau.bauleitung@gmail.com> wrote:\n> text")).toBe(
      "We reject your notice.",
    );
    expect(stripQuoted("Danke.\n-----Ursprüngliche Nachricht-----\nVon: x")).toBe("Danke.");
  });
});
