import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { test } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const ARTIFACT_DIR = "/opt/cursor/artifacts";

async function setLocale(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("people_lang", "en");
      localStorage.setItem("people_theme", "light");
    } catch {
      /* ignore */
    }
  });
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

async function visibleLockupMetrics(page, mobile) {
  return page.evaluate((isMobile) => {
    const pick = () => {
      const root = isMobile
        ? document.querySelector('[data-testid="header-brand-lockup-mobile"]')
        : document.querySelector('[data-testid="header-brand-lockup"]');
      const imgs = root ? [...root.querySelectorAll("img")] : [];
      return imgs.find((img) => {
        const style = getComputedStyle(img);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = img.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    };
    const img = pick();
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    return {
      src: img.getAttribute("src") ?? "",
      width: rect.width,
      height: rect.height,
      aspect: rect.width / rect.height,
    };
  }, mobile);
}

test.describe("header wordmark mobile matches desktop asset", () => {
  test.beforeAll(async () => {
    await mkdir(ARTIFACT_DIR, { recursive: true });
  });

  test("desktop 1280px reference", async ({ page }) => {
    await setLocale(page);
    await setWalletMock(page, false);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const desktop = await visibleLockupMetrics(page, false);
    assert.ok(desktop, "desktop lockup missing");
    assert.match(desktop.src, /people-lockup-(light|dark)\.png/);
    await page.locator("header").screenshot({ path: `${ARTIFACT_DIR}/header-desktop-1280.png` });
    test.info().attach("desktop-metrics", { body: JSON.stringify(desktop) });

    for (const width of [360, 390]) {
      for (const connected of [false, true]) {
        const state = connected ? "connected" : "disconnected";
        await setLocale(page);
        await setWalletMock(page, connected);
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
        const mobile = await visibleLockupMetrics(page, true);
        assert.ok(mobile, `${state}@${width}px: mobile lockup missing`);
        assert.equal(
          mobile.src,
          desktop.src,
          `${state}@${width}px: lockup src must match desktop (${mobile.src} vs ${desktop.src})`,
        );
        const aspectDelta = Math.abs(mobile.aspect - desktop.aspect);
        assert.ok(
          aspectDelta < 0.02,
          `${state}@${width}px: lockup aspect ratio should match desktop`,
        );
        const plainWordmark = await page.locator(
          '[data-testid="header-brand-mobile"] span.truncate.text-sm',
        ).count();
        assert.equal(plainWordmark, 0, `${state}@${width}px: plain PEOPLE text must not be used`);
        const visibleCount = await page.evaluate(() => {
          const root = document.querySelector('[data-testid="header-brand-lockup-mobile"]');
          if (!root) return 0;
          return [...root.querySelectorAll("img.header-lockup-theme")].filter((img) => {
            const style = getComputedStyle(img);
            if (style.display === "none") return false;
            const rect = img.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }).length;
        });
        assert.equal(visibleCount, 1, `${state}@${width}px: exactly one lockup img must render`);
        const box = await page.locator("header").boundingBox();
        assert.ok(box);
        await page.screenshot({
          path: `${ARTIFACT_DIR}/header-${state}-${width}.png`,
          clip: { x: box.x, y: box.y, width: box.width, height: box.height + 20 },
        });
      }
    }
  });
});
