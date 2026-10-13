import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";

const ARTIFACT_ROOT = process.env.ROADMAP_SCREENSHOT_DIR ?? "/opt/cursor/artifacts/screenshots";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

async function setLocale(page, lang) {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("ovn_lang", value);
    } catch {
      /* ignore */
    }
  }, lang);
}

async function gotoWithLocale(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "networkidle" });
}

async function ensureLocale(page, lang) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((code) => {
    localStorage.setItem("ovn_lang", code);
  }, lang);
  await page.reload({ waitUntil: "networkidle" });
}

for (const lang of ["en", "ru"]) {
  test(`roadmap and agents ${lang} screenshots`, async ({ page }) => {
    await mkdir(ARTIFACT_ROOT, { recursive: true });
    await setLocale(page, lang);
    await ensureLocale(page, lang);

    for (const [slug, name] of [
      ["roadmap", `roadmap-${lang}`],
      ["agents", `agents-${lang}`],
    ]) {
      for (const [w, h, suffix] of [
        [375, 900, "mobile-375"],
        [1440, 900, "desktop-1440"],
      ]) {
        await page.setViewportSize({ width: w, height: h });
        await gotoWithLocale(page, `${BASE}/${slug}`);
        if (slug === "agents") {
          await page.locator('[data-testid="agents-coming-next"]').scrollIntoViewIfNeeded();
          await page.screenshot({
            path: path.join(ARTIFACT_ROOT, `agents-coming-next-${lang}-${suffix}.png`),
            fullPage: false,
          });
        }
        await page.screenshot({
          path: path.join(ARTIFACT_ROOT, `${name}-${suffix}.png`),
          fullPage: true,
        });
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoWithLocale(page, `${BASE}/`);
    await page.getByRole("button", { name: /More|Ещё/ }).click();
    await page.screenshot({
      path: path.join(ARTIFACT_ROOT, `header-more-menu-${lang}-desktop-1440.png`),
      fullPage: false,
    });

    await gotoWithLocale(page, `${BASE}/`);
    await page.locator("footer").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(ARTIFACT_ROOT, `footer-${lang}-desktop-1440.png`),
      fullPage: false,
    });

    for (const [w, h, suffix] of [
      [375, 900, "mobile-375"],
      [1440, 900, "desktop-1440"],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await gotoWithLocale(page, `${BASE}/tokenomics`);
      await page.locator("#sale-pay").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(ARTIFACT_ROOT, `tokenomics-sale-${lang}-${suffix}.png`),
        fullPage: false,
      });
    }
  });
}
