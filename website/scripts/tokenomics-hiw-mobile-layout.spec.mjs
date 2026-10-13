import assert from "node:assert/strict";
import { test } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const WIDTHS = [360, 390];
const PATHS = ["/", "/tokenomics", "/how-it-works"];

async function setLocale(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ovn_lang", "en");
    } catch {
      /* ignore */
    }
  });
}

async function assertPageLayout(page, path, width) {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const utilities = document.querySelector(".header-utilities");
    const mobileBrand = document.querySelector('[data-testid="header-brand-mobile"]');
    const utilRect = utilities?.getBoundingClientRect();
    const brandRect = mobileBrand?.getBoundingClientRect();
    return {
      overflow: root.scrollWidth - window.innerWidth,
      utilVisible: utilRect ? utilRect.width > 0 && utilRect.right <= window.innerWidth + 1 : false,
      brandUtilOverlap: brandRect && utilRect ? brandRect.right > utilRect.left - 2 : false,
    };
  });
  assert.ok(metrics.overflow <= 2, `${path}@${width}px: horizontal overflow ${metrics.overflow}px`);
  assert.ok(metrics.utilVisible, `${path}@${width}px: header utilities clipped`);
  assert.ok(!metrics.brandUtilOverlap, `${path}@${width}px: brand overlaps utilities`);
}

test.describe("tokenomics and how-it-works mobile layout", () => {
  for (const width of WIDTHS) {
    for (const path of PATHS) {
      test(`${path} @ ${width}px`, async ({ page }) => {
        await setLocale(page);
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
        await assertPageLayout(page, path, width);
      });
    }
  }
});
