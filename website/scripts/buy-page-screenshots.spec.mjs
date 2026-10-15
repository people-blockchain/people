import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Evidence shots for `/buy` across the three reference widths, both themes and
 * both fully translated locales. Also asserts the page never scrolls
 * horizontally — the 360px column is the one that catches overflow.
 */
const OUT = process.env.SHOT_DIR ?? "/workspace/pb-buy-shots";
const BASE = process.env.SHOT_BASE_URL ?? "http://127.0.0.1:3111";

const VIEWPORTS = [
  { id: "360x780", width: 360, height: 780 },
  { id: "390x844", width: 390, height: 844 },
  { id: "1440x900", width: 1440, height: 900 },
];
const THEMES = ["dark", "light"];
const LANGS = ["en", "ru"];

mkdirSync(OUT, { recursive: true });

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const lang of LANGS) {
      test(`/buy ${viewport.id} ${theme} ${lang}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.context().addCookies([
          { name: "ovn_theme", value: theme, url: BASE },
          { name: "ovn_lang", value: lang, url: BASE },
        ]);
        await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
        await page.waitForSelector('[data-testid="buy-form-hero"]');
        // Let the scroll reveals settle before capturing.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(700);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(
          overflow.scrollWidth,
          `horizontal overflow at ${viewport.id} ${theme} ${lang}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1);

        await page.screenshot({
          path: `${OUT}/buy-${viewport.id}-${theme}-${lang}.png`,
          fullPage: true,
        });
      });
    }
  }
}
