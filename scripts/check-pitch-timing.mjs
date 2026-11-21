#!/usr/bin/env node
// Timing check for /pitch Scene 2 (the call) in AUTO pacing.
//
// Measures real DOM changes (MutationObserver), not the app's own clock, and
// asserts for every turn:
//   foreman message → document update      1500 ms ± 100 ms
//   typing indicator visible               1500 ms ± 100 ms
//   Klara's message appears in one frame   full text when first inserted
//
// Needs the app running (npm run dev or npm start) and Google Chrome.
// Usage: npm run check:pitch -- [--base http://localhost:3000] [--video out/] [--chrome /path/to/chrome]

import { chromium } from "playwright-core";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg("--base", "http://localhost:3000");
const VIDEO = arg("--video", null);
const CHROME = arg("--chrome", process.env.CHROME_PATH);
const TARGET = 1500;
const TOL = 100;
const TURNS = 4;

const browser = await chromium.launch({ headless: true, ...(CHROME ? { executablePath: CHROME } : { channel: "chrome" }) });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  ...(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: 1920, height: 1080 } } } : {}),
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.addInitScript(() => {
  const events = (window.__checkEvents = []);
  const now = () => performance.now();
  const scan = (node) => {
    if (!(node instanceof Element)) return;
    const els = [node, ...node.querySelectorAll("[data-who], p[data-text]")];
    for (const el of els) {
      if (el.matches('[data-who="foreman"]')) events.push({ type: "foreman", line: +el.dataset.line, t: now() });
      if (el.matches('[data-who="klara"][data-typing]')) events.push({ type: "typing", line: +el.dataset.line, t: now() });
      if (el.matches("p[data-text]")) {
        const bubble = el.closest('[data-who="klara"]');
        if (bubble) events.push({ type: "klara", line: +bubble.dataset.line, t: now(), text: el.textContent });
      }
    }
  };
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "childList") r.addedNodes.forEach(scan);
      else if (r.type === "attributes" && r.target.matches("[data-field]") && r.target.dataset.state !== "empty")
        events.push({ type: "field", field: r.target.dataset.field, state: r.target.dataset.state, t: now() });
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] });
});

await page.goto(`${BASE}/pitch?scene=2&pace=auto&debug=1`);
// AUTO: the whole call plays by itself; wait for Klara's last reply, then the document move.
await page.waitForFunction((n) => window.__checkEvents.filter((e) => e.type === "klara").length >= n, TURNS, { timeout: 60_000 });
await page.waitForTimeout(2500);

const { events, finalTexts, appLog } = await page.evaluate(() => ({
  events: window.__checkEvents,
  finalTexts: Object.fromEntries([...document.querySelectorAll('[data-who="klara"]')].map((b) => [b.dataset.line, b.querySelector("p[data-text]")?.textContent])),
  appLog: window.__klaraCallTimings ?? [],
}));
await context.close();
await browser.close();

const first = (pred) => events.find(pred);
const rows = [];
let failed = false;
for (let k = 1; k <= TURNS; k++) {
  const foremanLine = (k - 1) * 2;
  const klaraLine = foremanLine + 1;
  const foreman = first((e) => e.type === "foreman" && e.line === foremanLine);
  const klara = first((e) => e.type === "klara" && e.line === klaraLine);
  const typing = first((e) => e.type === "typing" && e.line === klaraLine);
  const doc = first((e) => e.type === "field" && foreman && e.t > foreman.t && (!klara || e.t < klara.t));
  const docGap = doc && foreman ? doc.t - foreman.t : NaN;
  const docToTyping = typing && doc ? typing.t - doc.t : NaN;
  const typingFor = klara && typing ? klara.t - typing.t : NaN;
  const oneFrame = !!klara && klara.text === finalTexts[klaraLine] && klara.text.length > 0;
  const ok = Math.abs(docGap - TARGET) <= TOL && Math.abs(typingFor - TARGET) <= TOL && oneFrame;
  if (!ok) failed = true;
  const app = appLog[k - 1] ?? {};
  rows.push({
    turn: k,
    "foreman→doc": Math.round(docGap),
    "doc→typing": Math.round(docToTyping),
    "typing visible": Math.round(typingFor),
    "full text at once": oneFrame,
    "app log (doc/typing)": app.doc && app.foreman ? `${Math.round(app.doc - app.foreman)} / ${Math.round(app.reply - app.typing)}` : "—",
    result: ok ? "ok" : "FAIL",
  });
}

console.log(`Scene 2 timing, AUTO pacing (target ${TARGET} ms ± ${TOL} ms, DOM-measured)`);
console.table(rows);
if (errors.length) {
  console.log("Page errors:", errors);
  failed = true;
}
if (VIDEO) console.log(`Video saved in ${VIDEO}`);
process.exit(failed ? 1 : 0);
