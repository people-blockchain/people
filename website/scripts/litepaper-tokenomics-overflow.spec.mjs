/**
 * fee07772: litepaper #tokenomics — bordered UI must not clip long locale strings.
 */
import assert from "node:assert/strict";
import { test } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const LOCALES = {
  ru: "ru-RU",
  de: "de-DE",
};

async function assertNoClipInSection(page, lang) {
  const bad = await page.evaluate(() => {
    const section = document.querySelector("#tokenomics");
    if (!section) return ["missing #tokenomics"];
    const failures = [];
    const nodes = section.querySelectorAll(
      "button, li, td, th, dt, dd, h3, p, [data-testid='litepaper-allocation-donut-card']",
    );
    for (const el of nodes) {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (el.scrollWidth > rect.width + 2 || el.scrollHeight > rect.height + 2) {
        const tag = `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).slice(0, 40)}` : ""}`;
        failures.push(`${tag}: scroll ${el.scrollWidth}x${el.scrollHeight} vs ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`);
      }
    }
    const rootOverflow = document.documentElement.scrollWidth - window.innerWidth;
    if (rootOverflow > 2) failures.push(`page horizontal overflow ${rootOverflow}px`);
    return failures;
  });
  assert.equal(bad.length, 0, `${lang}@${page.viewportSize()?.width}px: ${bad.join("; ")}`);
}

for (const [lang, locale] of Object.entries(LOCALES)) {
  for (const width of [360, 1280]) {
    test(`litepaper tokenomics no clipped text: ${lang} @ ${width}px`, async ({ browser }) => {
      const context = await browser.newContext({ locale, viewport: { width, height: 900 } });
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
      await page.locator("#tokenomics").scrollIntoViewIfNeeded();
      await assertNoClipInSection(page, lang);
      await context.close();
    });
  }
}
