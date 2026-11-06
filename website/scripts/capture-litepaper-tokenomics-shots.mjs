/**
 * One-off: capture litepaper #tokenomics section for ru/de at mobile + desktop.
 * Usage: BASE_URL=https://peopleblockchain.network node scripts/capture-litepaper-tokenomics-shots.mjs OUT_DIR
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const OUT = process.argv[2] ?? "docs/screenshots/litepaper-tokenomics";
const LOCALES = {
  ru: "ru-RU",
  de: "de-DE",
};
const VIEWPORTS = [
  { w: 390, h: 844, tag: "mobile" },
  { w: 1280, h: 900, tag: "desktop" },
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const [lang, locale] of Object.entries(LOCALES)) {
  for (const { w, h, tag } of VIEWPORTS) {
    const context = await browser.newContext({ locale, viewport: { width: w, height: h } });
    const page = await context.newPage();
    await page.addInitScript((l) => {
      try {
        localStorage.setItem("people_lang", l);
        localStorage.setItem("people_theme", "light");
      } catch {
        /* ignore */
      }
    }, lang);
    await page.goto(`${BASE}/litepaper`, { waitUntil: "networkidle", timeout: 120_000 });
    const section = page.locator("#tokenomics");
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const file = path.join(OUT, `${lang}-${tag}.png`);
    await section.screenshot({ path: file });
    await context.close();
    console.log("wrote", file);
  }
}
await browser.close();
