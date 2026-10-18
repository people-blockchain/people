import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

/**
 * With a remembered email, Google must stay the first / primary CTA.
 * Previously "Continue as {email}" sat above Google and always started email OTP —
 * even for accounts that were originally created with Google.
 */
test.describe("Google is the primary sign-in option on mobile", () => {
  for (const width of [360, 390]) {
    test(`remembered email does not bury Google @ ${width}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 800 },
        userAgent: ANDROID_UA,
        isMobile: true,
        hasTouch: true,
        locale: "en-US",
      });
      await context.addInitScript(() => {
        try {
          localStorage.setItem("ovn_lang", "en");
          localStorage.setItem("ppl_last_auth_email", "test@example.com");
          localStorage.setItem("ppl_last_auth_method", "google");
        } catch {
          /* ignore */
        }
      });
      const page = await context.newPage();
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

      const connectBtn = page.locator('[data-testid="header-sign-in"]:visible');
      await expect(connectBtn).toBeVisible({ timeout: 20000 });
      await connectBtn.click();

      const panel = page.getByTestId("wallet-web3auth-sign-in");
      try {
        await expect(panel).toBeVisible({ timeout: 20000 });
      } catch {
        test.skip(true, "Web3Auth sign-in UI not configured in this environment");
      }

      const google = page.getByTestId("wallet-sign-in-google");
      const continueAs = page.getByTestId("wallet-continue-as");
      await expect(google).toBeVisible({ timeout: 20000 });
      await expect(continueAs).toBeVisible();

      const order = await page.evaluate(() => {
        const g = document.querySelector('[data-testid="wallet-sign-in-google"]');
        const e = document.querySelector('[data-testid="wallet-continue-as"]');
        if (!g || !e) return null;
        const pos = g.compareDocumentPosition(e);
        return (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ? "google-first" : "email-first";
      });
      expect(order).toBe("google-first");
      await expect(google).toHaveClass(/bg-brand/);
      await expect(continueAs).toHaveClass(/bg-surface/);

      await context.close();
    });
  }
});
