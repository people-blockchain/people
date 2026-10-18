import assert from "node:assert/strict";
import { test, expect } from "@playwright/test";

const LOCALES = ["en", "ru", "de", "ar"];
const WIDTHS = [1024, 1440];
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

async function setLocale(page, lang) {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("people_lang", value);
    } catch {
      /* ignore */
    }
  }, lang);
}

async function assertHeaderSignInClick(page, lang, width) {
  await setLocale(page, lang);
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForResponse(
    (res) => res.url().includes("/api/auth/features") && res.status() === 200,
    { timeout: 15000 },
  ).catch(() => null);

  // Both header layouts mount; only one is painted at a given width.
  const login = page.locator('[data-testid="header-sign-in"]:visible').first();
  await login.waitFor({ state: "visible", timeout: 15000 });

  const hit = await login.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return top === el || el.contains(top);
  });
  assert.ok(hit, `${lang}@${width}px: header sign-in center blocked by another element`);

  const navStart = Date.now();
  await login.click({ timeout: 5000 });
  await expect(page.locator("dialog[open]")).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId("unified-wallet-auth")).toBeVisible();
  assert.ok(!page.url().includes("/login"), `${lang}@${width}px: must not navigate to /login`);
  assert.ok(Date.now() - navStart < 5000, `${lang}@${width}px: modal open too slow`);
}

test.describe("header sign-in click", () => {
  for (const lang of LOCALES) {
    for (const width of WIDTHS) {
      test(`${lang} @ ${width}px`, async ({ page }) => {
        await assertHeaderSignInClick(page, lang, width);
      });
    }
  }
});

test("mobile sheet sign-in @ 390px", async ({ page }) => {
  await setLocale(page, "ru");
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /меню|menu/i }).click();
  const login = page.locator("#mobile-menu [data-testid='header-sign-in']").first();
  await login.waitFor({ state: "visible" });
  const navStart = Date.now();
  await login.click();
  await expect(page.locator("dialog[open]")).toBeVisible({ timeout: 5000 });
  assert.ok(Date.now() - navStart < 5000);
});
