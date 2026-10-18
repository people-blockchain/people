import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const WIDTHS = [360, 390];
const ARTIFACT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../artifacts/header-mobile");

async function setLocale(page, lang = "en") {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("people_lang", value);
    } catch {
      /* ignore */
    }
  }, lang);
}

async function setWalletMock(page, connected) {
  await page.addInitScript((on) => {
    try {
      if (on) {
        sessionStorage.setItem("e2e-wallet-mock", "1");
        sessionStorage.setItem("e2e-wallet-address", "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12");
      } else {
        sessionStorage.removeItem("e2e-wallet-mock");
        sessionStorage.removeItem("e2e-wallet-address");
      }
    } catch {
      /* ignore */
    }
  }, connected);
}

async function assertNoHeaderOverlap(page, width, label) {
  const metrics = await page.evaluate(() => {
    const brand = document.querySelector('[data-testid="header-brand-mobile"]');
    const connect = document.querySelector('[data-testid="header-sign-in"]');
    const wallet = document.querySelector('[data-testid="header-wallet-menu-trigger"]');
    const utilities = document.querySelector(".header-utilities");
    const mobileLockupImgs = [...document.querySelectorAll('[data-testid="header-brand-lockup-mobile"] img')].filter(
      (img) => {
        const style = getComputedStyle(img);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
        const rect = img.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      },
    );
    const mobileLockup = mobileLockupImgs[0];
    const tagline = document.querySelector('[data-testid="header-brand-tagline"]');
    const slogan = document.querySelector('[data-testid="header-brand-slogan"]');

    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const brandRect = rect(brand);
    const actionRect = rect(connect ?? wallet);
    const utilStart = rect(utilities)?.left ?? Infinity;

    const overlaps = (a, b, pad = 2) => {
      if (!a || !b) return false;
      return a.right > b.left + pad && a.left < b.right - pad;
    };

    return {
      lockupImgCount: mobileLockupImgs.length,
      mobileLockupVisible: mobileLockup ? mobileLockup.getBoundingClientRect().width > 0 : false,
      mobileLockupSrc: mobileLockup?.getAttribute("src") ?? "",
      taglineVisible: tagline ? tagline.getBoundingClientRect().height > 0 && getComputedStyle(tagline).display !== "none" : false,
      sloganVisible: slogan ? slogan.getBoundingClientRect().height > 0 && getComputedStyle(slogan).display !== "none" : false,
      brandActionOverlap: overlaps(brandRect, actionRect),
      brandUtilOverlap: brandRect ? brandRect.right > utilStart - 2 : false,
      brandRight: brandRect?.right ?? 0,
      actionLeft: actionRect?.left ?? 0,
      utilStart,
    };
  });

  assert.equal(metrics.lockupImgCount, 1, `${label}@${width}px: exactly one lockup raster must be visible`);
  assert.ok(metrics.mobileLockupVisible, `${label}@${width}px: mobile lockup missing`);
  assert.match(metrics.mobileLockupSrc, /people-lockup-(light|dark)\.png/, `${label}@${width}px: compact wordmark asset`);
  assert.ok(!metrics.taglineVisible, `${label}@${width}px: tagline must be hidden on mobile`);
  assert.ok(!metrics.sloganVisible, `${label}@${width}px: slogan must be hidden on mobile`);
  assert.ok(!metrics.brandActionOverlap, `${label}@${width}px: brand overlaps wallet control`);
  assert.ok(!metrics.brandUtilOverlap, `${label}@${width}px: brand overlaps utilities (${metrics.brandRight} > ${metrics.utilStart})`);
}

test.describe("mobile header layout", () => {
  test.beforeAll(async () => {
    await mkdir(ARTIFACT_ROOT, { recursive: true });
  });

  for (const width of WIDTHS) {
    for (const connected of [false, true]) {
      const state = connected ? "connected" : "disconnected";
      test(`${state} @ ${width}px`, async ({ page }) => {
        await setLocale(page, "en");
        await setWalletMock(page, connected);
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
        await assertNoHeaderOverlap(page, width, state);
        await page.screenshot({
          path: join(ARTIFACT_ROOT, `header-${state}-${width}.png`),
          fullPage: false,
        });
      });
    }
  }

  for (const width of [360, 390, 1024, 1440]) {
    test(`wallet menu interaction (open, copy, dismiss, disconnect) @ ${width}px`, async ({ context, page }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => null);
      await setLocale(page, "ru");
      await setWalletMock(page, true);
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

      const trigger = page.locator('[data-testid="header-wallet-menu-trigger"]:visible');
      await trigger.waitFor({ state: "visible", timeout: 10000 });

      // 1. Click address opens the menu
      await trigger.click();
      const menu = page.locator('ul[role="menu"]');
      await menu.waitFor({ state: "visible", timeout: 5000 });
      assert.ok(await menu.isVisible(), `${width}px: wallet menu should be visible after click`);

      // Verify menu item is not clipped
      const copyBtn = page.locator('[data-testid="header-wallet-copy-address"]:visible');
      await copyBtn.waitFor({ state: "visible", timeout: 5000 });
      assert.ok(await copyBtn.isVisible(), `${width}px: copy address button should be visible`);

      // 2. Click «Скопировать адрес» copies address and displays feedback
      await copyBtn.click();
      await expect(copyBtn).toHaveText(/скопировано|copied/i);

      // 3. Click outside menu closes it
      await page.mouse.click(5, 5);
      await expect(menu).toBeHidden({ timeout: 5000 });

      // 4. Reopen and click «Отключить» disconnects wallet
      await trigger.click();
      await menu.waitFor({ state: "visible", timeout: 5000 });
      const disconnectBtn = page.locator('[data-testid="header-wallet-disconnect"]:visible');
      await disconnectBtn.waitFor({ state: "visible", timeout: 5000 });
      await disconnectBtn.click();

      // Header should now display the sign-in button again
      const connectBtn = page.locator('[data-testid="header-sign-in"]:visible');
      await expect(connectBtn).toBeVisible({ timeout: 10000 });
    });
  }
});

