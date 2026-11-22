import { describe, expect, it } from "vitest";
import { chipRect, visibleChips, type ChipSite } from "./chip-layout";

const site = (id: string, x: number, y: number, rank = 1, flip = false): ChipSite => ({ id, x, y, text: `${id} · 1 offen`, rank, flip });
const box = { w: 600, h: 300 };

describe("map labels", () => {
  it("three spread-out sites all keep their label", () => {
    const shown = visibleChips([site("Schwabing", 330, 100), site("Riem", 500, 180, 1, true), site("Pasing", 150, 160)], box);
    expect(Object.fromEntries(shown)).toEqual({ Schwabing: "right", Riem: "left", Pasing: "right" });
  });

  it("close sites: the more urgent one is placed first; the other opens to the free side", () => {
    expect(Object.fromEntries(visibleChips([site("A", 200, 150, 1), site("B", 260, 152, 3)], box))).toEqual({ B: "right", A: "left" });
    // No free side at all: the less urgent label is hidden (it shows while hovered).
    expect([...visibleChips([site("A", 60, 150, 1), site("B", 110, 152, 3)], box).keys()]).toEqual(["B"]);
  });

  it("a label never covers another pin or leaves the map", () => {
    const sites = [site("A", 40, 100), site("B", 90, 100), site("C", 590, 290)];
    const shown = visibleChips(sites, box);
    expect(shown.has("A")).toBe(false); // right: over pin B; left: off the map
    expect(shown.get("C")).toBe("left"); // right would leave the map
    expect(chipRect(site("D", 300, 100, 1, true)).x + chipRect(site("D", 300, 100, 1, true)).w).toBeLessThan(300 - 14);
  });
});
