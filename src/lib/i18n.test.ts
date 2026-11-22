// DE/EN switch: fixed texts, texts the server builds, label maps.
import { afterEach, describe, expect, it } from "vitest";
import { docTitle, fieldLabel } from "@/lib/doctypes";
import { $t, $tx, setCurrentLang } from "@/lib/i18n";
import { CASE_STATUS_DE, EVENT_DE, ROLE_GENITIVE_DE } from "@/lib/labels";

afterEach(() => setCurrentLang("de"));

describe("i18n", () => {
  it("stays German by default (and on the server)", () => {
    expect($t("Vorgänge")).toBe("Vorgänge");
    expect($tx("unverzüglich – heute")).toBe("unverzüglich – heute");
    expect(CASE_STATUS_DE.bereit).toBe("Bereit");
    expect(docTitle("behinderungsanzeige")).toBe("Behinderungsanzeige");
  });

  it("translates fixed texts with placeholders", () => {
    setCurrentLang("en");
    expect($t("Vorgänge")).toBe("Cases");
    expect($t("Frage an {team} gesendet", { team: "Team Estrich" })).toBe("Question sent to Team Estrich");
    expect($t("Unbekannter Text bleibt")).toBe("Unbekannter Text bleibt");
  });

  it("translates the texts the server builds", () => {
    setCurrentLang("en");
    expect($tx("3 Werktage – bis 25.11.2026")).toBe("3 working days – by 25.11.2026");
    expect($tx("1 Tag – bis 21.11.2026")).toBe("1 day – by 21.11.2026");
    expect($tx("unverzüglich – seit 20.11.2026, heute senden")).toBe("without delay – since 20.11.2026, send today");
    expect($tx("Fehlt: Beginn der Behinderung, Bereich")).toBe("Missing: Hindrance since, Area");
    expect($tx("Adressat: Bauherr (Architekt ohne Vollmacht)")).toBe("Addressee: Client (architect without authority)");
    expect($tx("Meldung unsicher erkannt (45 %) – bitte prüfen")).toBe("Report recognised with low confidence (45 %) – please check");
    expect($tx("Zugang belegt: Antwort des Bauherrn vom 21.11.2026")).toBe("Receipt proven: reply from the client of 21.11.2026");
    expect($tx("Fassade auf Baustelle B 6 Tage im Verzug")).toBe("Facade on site B 6 days late");
    expect($tx("Elektro · Riem · Behinderung offen")).toBe("Electrical · Riem · hindrance open");
    expect($tx("Bericht fehlt · Estrich · Schwabing")).toBe("Report missing · Screed · Schwabing");
    expect($tx("1 Behinderung")).toBe("1 hindrance");
    expect($tx("Antwort des Bauherrn: Zurückweisung – „Die Elektroarbeiten liegen im Zeitplan.“")).toBe(
      "Reply from the client: Rejection – „Die Elektroarbeiten liegen im Zeitplan.“",
    );
  });

  it("label maps and doc type helpers follow the language", () => {
    setCurrentLang("en");
    expect(CASE_STATUS_DE.validiert).toBe("Validated");
    expect(EVENT_DE.email_sent).toBe("E-mail sent");
    expect(ROLE_GENITIVE_DE.bauherr).toBe("from the client");
    expect(docTitle("mehrkostenanzeige")).toBe("Notice of extra costs");
    expect(fieldLabel("behinderungsanzeige", "idle_staff")).toBe("Idle workers");
  });
});
