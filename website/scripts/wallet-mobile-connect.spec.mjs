import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const HOST = new URL(BASE).host;
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const SHOTS = process.env.WALLET_SHOTS_DIR;

const VIEWPORTS = [
  { name: "360", width: 360, height: 740, mobile: true },
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "desktop", width: 1440, height: 900, mobile: false },
];

async function open(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    userAgent: vp.mobile ? ANDROID_UA : undefined,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    locale: "en-US",
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("wallet-external-connect")).toBeVisible({ timeout: 15000 });
  return { context, page };
}

async function assertNoHorizontalScroll(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const vp of VIEWPORTS) {
  test.describe(`wallet connect @ ${vp.name}`, () => {
    test("layout has no horizontal scroll", async ({ browser }) => {
      const { context, page } = await open(browser, vp);
      await assertNoHorizontalScroll(page);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/login-${vp.name}.png`, fullPage: true });
      await context.close();
    });

    if (vp.mobile) {
      for (const [testId, urlPart] of [
        ["wallet-connect-metamask", `https://metamask.app.link/dapp/${HOST}/login`],
        ["wallet-connect-trust", "https://link.trustwallet.com/open_url?coin_id=60&url="],
      ]) {
        test(`${testId}: no window.ethereum → deep link`, async ({ browser }) => {
          const { context, page } = await open(browser, vp);
          let target = null;
          await context.route(/metamask\.app\.link|link\.trustwallet\.com/, (route) => {
            target = route.request().url();
            return route.fulfill({ status: 200, contentType: "text/html", body: "<title>wallet</title>" });
          });
          await page.getByTestId(testId).click();
          // An intermediate step explains what will happen; the deep link opens on confirm.
          await page.getByTestId("wallet-ext-open").click();
          await expect.poll(() => target, { timeout: 5000 }).not.toBeNull();
          expect(target.startsWith(urlPart)).toBe(true);
          if (testId.includes("trust")) {
            expect(decodeURIComponent(target)).toContain(`${HOST}/login`);
          }
          await context.close();
        });
      }

      test("wrong in-app wallet does not redirect or show a raw code", async ({ browser }) => {
        const { context, page } = await open(browser, vp);
        await page.evaluate(() => {
          window.ethereum = { isMetaMask: true, request: async () => [] };
        });
        await page.getByTestId("wallet-connect-trust").click();
        // Inside another wallet's in-app browser the injected wallet is used instead of failing
        // or deep-linking out; it must never loop to the app store / show raw error codes.
        await page.waitForTimeout(2000);
        expect(page.url()).toContain("/login");
        await expect(page.locator("body")).not.toContainText("no_injected_provider");
        await expect(page.locator("body")).not.toContainText("wallet_app_redirect");
        await context.close();
      });
    } else {
      test("desktop without extension shows a readable message", async ({ browser }) => {
        const { context, page } = await open(browser, vp);
        await page.getByTestId("wallet-connect-metamask").click();
        const step = page.getByTestId("wallet-ext-step");
        await expect(step).toContainText("MetaMask was not found");
        await expect(page.locator("body")).not.toContainText("no_injected_provider");
        await context.close();
      });
    }

    test("stuck Web3Auth init ends in an error with Retry", async ({ browser }) => {
      const { context, page } = await open(browser, vp);
      await context.close();
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        userAgent: vp.mobile ? ANDROID_UA : undefined,
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
        locale: "en-US",
      });
      const p = await ctx.newPage();
      // Never answer Web3Auth network calls: init hangs exactly like a blocked popup/session.
      await ctx.route(/web3auth\.io|openlogin|torus|tor\.us/, () => new Promise(() => {}));
      await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
      // /login renders the Google / email panel only when the server has auth env
      // (AUTH_SECRET, DATABASE_URL, AUTH_GOOGLE_ID/SECRET). Without it there is nothing to test.
      const panel = p.getByTestId("wallet-web3auth-sign-in");
      const rendered = await panel.waitFor({ timeout: 8000 }).then(() => true, () => false);
      test.skip(!rendered, "sign-in panel not rendered: server has no auth env");
      // Real wait: the init watchdog is 30s (React's scheduler breaks under a fake clock).
      await expect(p.getByTestId("wallet-sign-in-error")).toBeVisible({ timeout: 45_000 });
      await expect(p.getByTestId("wallet-sign-in-retry")).toBeVisible();
      await expect(p.getByTestId("wallet-sign-in-error")).not.toContainText(/timeout|_/);
      await assertNoHorizontalScroll(p);
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/signin-timeout-${vp.name}.png`, fullPage: true });
      await ctx.close();
      void page;
    });
  });
}
