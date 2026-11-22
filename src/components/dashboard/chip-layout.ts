// Which site labels ("Riem · 1 offen") fit on the map without covering another
// pin or label. The most urgent sites get their label first; a hidden label
// shows again while its site is hovered or focused. Pure, in pixels.

export type ChipSite = { id: string; x: number; y: number; text: string; rank: number; flip: boolean };

type Rect = { x: number; y: number; w: number; h: number };
const PIN = 28;
const GAP = 6;
const CHIP_H = 20;
/** Width of a text-xs label (Geist ≈ 6.6 px per character) plus padding and border. */
export const chipWidth = (text: string) => Math.round(text.length * 6.6 + 14);

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function chipRect(s: ChipSite): Rect {
  const w = chipWidth(s.text);
  return { x: s.flip ? s.x - PIN / 2 - GAP - w : s.x + PIN / 2 + GAP, y: s.y - CHIP_H / 2, w, h: CHIP_H };
}

/** The sites whose label is shown, with the side it opens to (the preferred side first, else the other). */
export function visibleChips(sites: ChipSite[], box: { w: number; h: number }): Map<string, "right" | "left"> {
  const pins = sites.map((s) => ({ id: s.id, r: { x: s.x - PIN / 2, y: s.y - PIN / 2, w: PIN, h: PIN } }));
  const placed: Rect[] = [];
  const shown = new Map<string, "right" | "left">();
  for (const s of [...sites].sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id))) {
    for (const flip of [s.flip, !s.flip]) {
      const r = chipRect({ ...s, flip });
      const inside = r.x >= 0 && r.x + r.w <= box.w && r.y >= 0 && r.y + r.h <= box.h;
      if (!inside || pins.some((p) => p.id !== s.id && overlaps(r, p.r)) || placed.some((p) => overlaps(r, p))) continue;
      placed.push(r);
      shown.set(s.id, flip ? "left" : "right");
      break;
    }
  }
  return shown;
}
