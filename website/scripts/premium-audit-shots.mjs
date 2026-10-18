// One-off screenshot harness for the premium redesign audit. Not part of the
// test suite; run manually with `node scripts/premium-audit-shots.mjs <outDir> <baseURL>`.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "docs/screenshots/premium/audit-before";
const baseURL = process.argv[3] || "http://localhost:3000";

const PAGES = [
  ["home", "/"],
  ["how-it-works", "/how-it-works"],
  ["founders", "/founders"],
  ["tokenomics", "/tokenomics"],
  ["roadmap", "/roadmap"],
  ["fees", "/fees"],
  ["transparency", "/transparency"],
  ["discover", "/discover"],
  ["explorer", "/explorer"],
  ["swap", "/swap"],
  ["create", "/create"],
  ["buy", "/buy"],
  ["lavka", "/lavka"],
  ["agents", "/agents"],
  ["partner", "/partner"],
  ["docs", "/docs"],
  ["wallet", "/wallet"],
  ["login", "/login"],
  ["privacy", "/privacy"],
  ["terms", "/terms"],
];

const WIDTHS = (process.argv[4] || "390,1280").split(",").map(Number);
const THEMES = ["dark", "light"];

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

for (const theme of THEMES) {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.addInitScript((themeValue) => {
    try {
      window.localStorage.setItem("people_theme", themeValue);
      window.localStorage.setItem("people_lang", "en");
    } catch {}
  }, theme);
  const page = await context.newPage();

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, route] of PAGES) {
      const url = baseURL + route;
      try {
        await page.goto(url, { waitUntil: "load", timeout: 20000 });
      } catch (err) {
        console.error(`FAILED ${url}: ${err.message}`);
        continue;
      }
      await page.waitForTimeout(500);
      const file = path.join(outDir, `${name}-${theme}-${width}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`shot: ${file}`);
    }
  }
  await context.close();
}

await browser.close();
