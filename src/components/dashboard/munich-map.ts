// Generated (stylised): Munich outline, 25 district cells (Voronoi of district centres), the Isar.
// Projection: x = (lng - 11.34) * cos(48.15°) * 2397.0, y = (48.26 - lat) * 2397.0.
export const MAP_W = 640;
export const MAP_H = 503;
export const OUTLINE = "M575.7,155.8 L607.7,227.7 L607.7,299.6 L575.7,371.5 L511.8,443.4 L415.8,474.6 L319.8,467.4 L255.9,443.4 L175.9,407.5 L96.0,359.5 L48.0,299.6 L32.0,239.7 L64.0,179.8 L127.9,131.8 L271.9,40.7 L351.8,28.8 L447.8,59.9 L511.8,107.9 Z";
export const DISTRICTS = [
  "M403.9,254.6 L408.0,253.6 L421.8,276.7 L378.9,324.4 L360.0,288.3 Z",
  "M338.1,284.7 L360.0,288.3 L378.9,324.4 L378.2,333.2 L365.0,346.4 L327.2,321.1 Z",
  "M322.8,264.2 L327.2,237.5 L403.9,254.6 L360.0,288.3 L338.1,284.7 Z",
  "M319.3,211.2 L324.3,197.8 L385.8,197.8 L415.2,227.2 L408.0,253.6 L403.9,254.6 L327.2,237.5 Z",
  "M421.8,276.7 L442.9,292.3 L437.1,344.1 L378.2,333.2 L378.9,324.4 Z",
  "M303.9,328.9 L327.2,321.1 L365.0,346.4 L361.1,370.1 L335.8,390.3 L303.9,373.3 Z",
  "M251.9,331.6 L283.9,315.6 L303.9,328.9 L303.9,373.3 L251.9,387.1 Z",
  "M283.9,283.7 L322.8,264.2 L338.1,284.7 L327.2,321.1 L303.9,328.9 L283.9,315.6 Z",
  "M233.2,234.2 L319.3,211.2 L327.2,237.5 L322.8,264.2 L283.9,283.7 L235.1,251.1 Z",
  "M245.7,133.7 L314.9,160.1 L324.3,197.8 L319.3,211.2 L233.2,234.2 L220.3,218.4 Z",
  "M417.9,50.2 L422.3,51.7 L385.8,197.8 L324.3,197.8 L314.9,160.1 Z",
  "M447.8,59.9 L511.8,107.9 L562.0,145.5 L415.2,227.2 L385.8,197.8 L422.3,51.7 Z",
  "M562.0,145.5 L575.7,155.8 L595.0,199.1 L513.7,276.5 L442.9,292.3 L421.8,276.7 L408.0,253.6 L415.2,227.2 Z",
  "M442.9,292.3 L513.7,276.5 L498.6,357.0 L446.4,362.8 L437.1,344.1 Z",
  "M595.0,199.1 L607.7,227.7 L607.7,299.6 L575.7,371.5 L547.8,402.9 L498.6,357.0 L513.7,276.5 Z",
  "M511.8,443.4 L435.5,468.2 L428.0,403.7 L446.4,362.8 L498.6,357.0 L547.8,402.9 Z",
  "M365.0,346.4 L378.2,333.2 L437.1,344.1 L446.4,362.8 L428.0,403.7 L361.1,370.1 Z",
  "M415.8,474.6 L335.8,468.6 L335.8,390.3 L361.1,370.1 L428.0,403.7 L435.5,468.2 Z",
  "M319.8,467.4 L255.9,443.4 L218.9,426.8 L251.9,387.1 L303.9,373.3 L335.8,390.3 L335.8,468.6 Z",
  "M175.9,407.5 L109.5,367.7 L131.6,340.1 L209.2,303.1 L251.9,331.6 L251.9,387.1 L218.9,426.8 Z",
  "M150.7,212.6 L220.3,218.4 L233.2,234.2 L235.1,251.1 L209.2,303.1 L131.6,340.1 Z",
  "M96.0,359.5 L48.0,299.6 L32.0,239.7 L64.0,179.8 L96.3,155.6 L150.7,212.6 L131.6,340.1 L109.5,367.7 Z",
  "M96.3,155.6 L127.9,131.8 L215.1,76.7 L245.7,133.7 L220.3,218.4 L150.7,212.6 Z",
  "M215.1,76.7 L271.9,40.7 L351.8,28.8 L417.9,50.2 L314.9,160.1 L245.7,133.7 Z",
  "M235.1,251.1 L283.9,283.7 L283.9,315.6 L251.9,331.6 L209.2,303.1 Z"
];
export const ISAR = "M340.6,474.6 L359.8,419.5 L372.6,371.5 L387.0,335.6 L399.8,311.6 L407.8,287.6 L420.6,251.7 L431.8,215.7 L447.8,167.8 L471.8,107.9 L499.0,28.8";
export function project(lat: number, lng: number): [number, number] {
  return [(lng - 11.34) * 0.667183 * 2397.0, (48.26 - lat) * 2397.0];
}

// ── Names, smoothing, hit test (for the interactive map card) ─────────────

/** The 25 Stadtbezirke, in the order of DISTRICTS (official numbering 1–25). */
export const DISTRICT_NAMES = [
  "Altstadt-Lehel", "Ludwigsvorstadt-Isarvorstadt", "Maxvorstadt", "Schwabing-West", "Au-Haidhausen", "Sendling",
  "Sendling-Westpark", "Schwanthalerhöhe", "Neuhausen-Nymphenburg", "Moosach", "Milbertshofen-Am Hart", "Schwabing-Freimann",
  "Bogenhausen", "Berg am Laim", "Trudering-Riem", "Ramersdorf-Perlach", "Obergiesing-Fasangarten", "Untergiesing-Harlaching",
  "Thalkirchen-Obersendling-Forstenried-Fürstenried-Solln", "Hadern", "Pasing-Obermenzing", "Aubing-Lochhausen-Langwied",
  "Allach-Untermenzing", "Feldmoching-Hasenbergl", "Laim",
];

type Pt = [number, number];
const pointsOf = (d: string): Pt[] => [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const DISTRICT_POINTS = DISTRICTS.map(pointsOf);

/** Area centroid of each district (label position). */
export const DISTRICT_CENTROIDS: Pt[] = DISTRICT_POINTS.map((p) => {
  let a = 0, cx = 0, cy = 0;
  p.forEach(([x0, y0], i) => {
    const [x1, y1] = p[(i + 1) % p.length];
    const c = x0 * y1 - x1 * y0;
    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  });
  return [cx / (3 * a), cy / (3 * a)];
});

/** Index of the district containing map point (x, y), or -1. */
export function districtAt(x: number, y: number): number {
  return DISTRICT_POINTS.findIndex((p) => {
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i];
      const [xj, yj] = p[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}

/** Catmull-Rom through the points, as cubic Béziers (a smooth line through the same points). */
function smooth(p: Pt[], closed: boolean): string {
  const at = (i: number) => (closed ? p[(i + p.length) % p.length] : p[Math.max(0, Math.min(p.length - 1, i))]);
  const n = closed ? p.length : p.length - 1;
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return closed ? `${d} Z` : d;
}

/** The Isar as a smooth curve (south → north). */
export const ISAR_SMOOTH = smooth(pointsOf(ISAR), false);
/** Where the "Isar" label sits, and its angle (along the river, south of the centre). */
export const ISAR_LABEL = (() => {
  const p = pointsOf(ISAR);
  const [[x0, y0], [x1, y1]] = [p[3], p[4]];
  const len = Math.hypot(x1 - x0, y1 - y0);
  return { x: (x0 + x1) / 2 + ((y0 - y1) / len) * 11, y: (y0 + y1) / 2 + ((x1 - x0) / len) * 11, angle: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI };
})();

/** Mittlerer Ring (approximate course, clockwise from Landshuter Allee). */
const RING_LATLNG: Pt[] = [
  [48.176, 11.535], [48.1795, 11.565], [48.178, 11.586], [48.165, 11.604], [48.155, 11.615], [48.135, 11.617],
  [48.12, 11.611], [48.108, 11.578], [48.111, 11.548], [48.117, 11.525], [48.132, 11.519], [48.145, 11.532], [48.16, 11.534],
];
export const RING = smooth(RING_LATLNG.map(([la, ln]) => project(la, ln)), true);
export const RING_LABEL = (() => {
  const [x, y] = project(48.1795, 11.565);
  return { x, y: y - 9 };
})();

/** The city's bounding box (plus a margin), in map units. */
export const BOUNDS = { x: 20, y: 16, w: 600, h: 471 };
