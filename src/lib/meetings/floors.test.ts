import { describe, expect, it } from "vitest";
import { findFloors, germanFloors } from "./floors";

const de = (t: string) => findFloors(t).map((f) => f.de);

describe("floor numbers → German counting", () => {
  it("Russian and Ukrainian count the ground floor as 1", () => {
    expect(de("Третий этаж до сих пор не освобождён, мы стоим с утра.")).toEqual(["2. OG"]);
    expect(de("Мы на 3-м этаже.")).toEqual(["2. OG"]);
    expect(de("3-й этаж")).toEqual(["2. OG"]);
    expect(de("1-й этаж")).toEqual(["EG"]);
    expect(de("на первом этаже")).toEqual(["EG"]);
    expect(de("третій поверх")).toEqual(["2. OG"]);
    expect(de("на третьому поверсі")).toEqual(["2. OG"]);
    expect(de("автор этажа")).toEqual([]);
  });

  it("notes every conversion", () => {
    const [f] = findFloors("Третий этаж до сих пор не освобождён.");
    expect(f.converted).toBe(true);
    expect(f.note).toBe("Etagenangabe umgerechnet: RU „Третий этаж“ → 2. OG");
  });

  it("Polish, Serbian/Croatian, Turkish and Romanian count like German", () => {
    expect(de("Drugie piętro skończymy dopiero w piątek.")).toEqual(["2. OG"]);
    expect(de("na drugim piętrze")).toEqual(["2. OG"]);
    expect(de("na parterze")).toEqual(["EG"]);
    expect(de("Bez revizije C ne možemo da počnemo na trećem spratu.")).toEqual(["3. OG"]);
    expect(de("на трећем спрату")).toEqual(["3. OG"]);
    expect(de("u prizemlju")).toEqual(["EG"]);
    expect(de("na drugom katu")).toEqual(["2. OG"]);
    expect(de("üçüncü katta")).toEqual(["3. OG"]);
    expect(de("zemin katta")).toEqual(["EG"]);
    expect(de("etajul al doilea")).toEqual(["2. OG"]);
    expect(de("la etajul 3")).toEqual(["3. OG"]);
    expect(de("parter")).toEqual(["EG"]);
    expect(findFloors("na drugim piętrze").every((f) => !f.converted && f.note === null)).toBe(true);
  });

  it("English: ground floor is EG, 'first floor' is ambiguous and must be confirmed", () => {
    expect(de("on the ground floor")).toEqual(["EG"]);
    const [first] = findFloors("the first floor is blocked");
    expect(first.de).toBe("EG/1. OG?");
    expect(first.level).toBeNull();
    expect(first.note).toMatch(/mehrdeutig.*bitte bestätigen/);
    expect(de("3rd floor")).toEqual(["3. OG"]);
  });

  it("reads German floors", () => {
    expect(germanFloors("Das 2. OG ist frei, im 3.OG und im 4. Obergeschoss nicht, EG fertig.")).toEqual(["2. OG", "3. OG", "4. OG", "EG"]);
  });
});
