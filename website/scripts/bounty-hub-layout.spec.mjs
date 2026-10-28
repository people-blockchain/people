import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const WIDTHS = [360, 390, 1440];

async function setLocale(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("people_lang", "en");
    } catch {
      /* ignore */
    }
  });
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label}: horizontal overflow ${overflow}px`).toBeLessThanOrEqual(2);
}

test.describe("bounty hub layout", () => {
  for (const width of WIDTHS) {
    test(`/bounty and homepage links @ ${width}px`, async ({ page }) => {
      await setLocale(page);
      await page.setViewportSize({ width, height: 900 });

      await page.goto(`${BASE}/bounty`, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Earn PPL with PEOPLE");
      const buy = page.getByTestId("bounty-hero-buy");
      await expect(buy).toBeVisible();
      await expect(buy).toHaveAttribute("href", "/buy");
      await assertNoOverflow(page, `/bounty@${width}px`);

      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
      const homeBounty = page.getByTestId("home-hero-founder-cta");
      await expect(homeBounty).toBeVisible();
      await expect(homeBounty).toHaveAttribute("href", "/bounty");

      if (width >= 1024) {
        await expect(page.locator('header nav a[href="/bounty"]:visible').first()).toBeVisible();
      } else {
        await page.locator('button[aria-controls="mobile-menu"]').click();
        const sheet = page.locator("#mobile-menu");
        await expect(sheet).toBeVisible();
        await expect(sheet.locator('a[href="/bounty"]').first()).toBeVisible();
      }
    });
  }
});
