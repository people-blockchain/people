import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
// CI runners are not root: default to the OS temp dir, override with env.
const ARTIFACT_DIR = process.env.HEADER_LOCKUP_SCREENSHOT_DIR ?? path.join(tmpdir(), "people-header-lockup");

const WIDTHS = [360, 390, 640, 767];
const THEMES = ["light", "dark"];

async function setLocaleAndTheme(page, theme) {
  await page.addInitScript((th) => {
    try {
      localStorage.setItem("ovn_lang", "en");
      localStorage.setItem("ovn_theme", th);
    } catch {
      /* ignore */
    }
  }, theme);
}

async function countVisibleLockupImgs(page) {
  return page.evaluate(() => {
    const mobileRoot = document.querySelector('[data-testid="header-brand-lockup-mobile"]');
    const desktopRoot = document.querySelector('[data-testid="header-brand-lockup"]');
    const bundle = document.querySelector(".header-brand-bundle");
    const bundleStyle = bundle ? getComputedStyle(bundle) : null;
    const bundleHidden =
      !bundle ||
      bundleStyle.display === "none" ||
      bundleStyle.visibility === "hidden";

    const visibleIn = (root) => {
      if (!root) return 0;
      return [...root.querySelectorAll("img.header-lockup-theme")].filter((img) => {
        const style = getComputedStyle(img);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = img.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length;
    };

    const mobileVisible = visibleIn(mobileRoot);
    const desktopVisible = bundleHidden ? 0 : visibleIn(desktopRoot);

    return {
      mobileVisible,
      desktopVisible,
      total: mobileVisible + desktopVisible,
    };
  });
}

async function screenshotHeaderPlusBelow(page, path) {
  const box = await page.locator("header").boundingBox();
  assert.ok(box, "header bounding box missing");
  await page.screenshot({
    path,
    clip: {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y),
      width: box.width,
      height: box.height + 20,
    },
  });
}

test.describe("header lockup single render (mobile/tablet)", () => {
  test.beforeAll(async () => {
    await mkdir(ARTIFACT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`${theme} theme @ ${width}px — exactly one lockup visible`, async ({ page }) => {
        await setLocaleAndTheme(page, theme);
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

        if (theme === "dark") {
          await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
        } else {
          await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
        }

        const counts = await countVisibleLockupImgs(page);
        assert.equal(
          counts.mobileVisible,
          1,
          `${theme}@${width}px: mobile lockup must show exactly one img (got ${counts.mobileVisible})`,
        );
        assert.equal(
          counts.desktopVisible,
          0,
          `${theme}@${width}px: desktop lockup must be hidden (got ${counts.desktopVisible})`,
        );
        assert.equal(counts.total, 1, `${theme}@${width}px: total visible lockup imgs must be 1`);

        await screenshotHeaderPlusBelow(
          page,
          `${ARTIFACT_DIR}/header-lockup-${theme}-${width}.png`,
        );
      });
    }
  }
});
