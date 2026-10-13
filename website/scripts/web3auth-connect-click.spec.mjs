import assert from "node:assert/strict";
import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

async function setLocale(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ovn_lang", "en");
    } catch {
      /* ignore */
    }
  });
}

test.describe("Web3Auth sign-in click handler", () => {
  test("Google click does not surface popup-blocked error", async ({ page }) => {
    await setLocale(page);
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });

    const google = page.getByTestId("wallet-sign-in-google");
    const visible = await google.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, "Web3Auth sign-in UI not configured in this environment");
    }

    await expect(google).toBeEnabled({ timeout: 20000 });
    await google.click();

    await page.waitForTimeout(1500);
    const errorText = await page.locator('[data-testid="wallet-web3auth-sign-in"] p.text-warm').textContent().catch(() => "");
    assert.ok(
      !String(errorText).toLowerCase().includes("popup was blocked"),
      `unexpected popup-blocked error: ${errorText}`,
    );
  });
});
