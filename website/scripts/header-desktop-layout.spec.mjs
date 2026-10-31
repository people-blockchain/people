import assert from "node:assert/strict";
import { test } from "@playwright/test";

const LOCALES = ["en", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar", "ru"];
const WIDTHS = [1024, 1280, 1440, 1920];

async function setLocale(page, lang) {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("people_lang", value);
    } catch {
      /* ignore */
    }
  }, lang);
}

async function assertDesktopHeader(page, lang, width) {
  await page.waitForFunction(
    () => {
      const brand = document.querySelector("header a.group");
      return Boolean(brand && brand.getBoundingClientRect().width > 80);
    },
    undefined,
    { timeout: 8_000 },
  );
  const metrics = await page.evaluate(() => {
    const stack = document.querySelector(".header-brand-bundle");
    const nav = document.querySelector("header nav");
    const utilities = document.querySelector("header .ml-auto");
    const lockup = [...document.querySelectorAll('[data-testid="header-brand-lockup"] img')].find(
      (img) => img.getBoundingClientRect().width > 0
    );
    if (!stack || !nav || !utilities || !lockup) {
      return { ok: false, reason: "missing elements" };
    }

    const brandLink = document.querySelector("header a.group");
    const brandRect = brandLink?.getBoundingClientRect();
    const stackRect = stack.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    const utilRect = utilities.getBoundingClientRect();
    const lockupRect = lockup.getBoundingClientRect();
    // The first nav link is not always painted: How It Works and Discover are
    // gated to 2xl, and «How It Works» is now the leading entry since Join left
    // the nav for the single header «Sign in». Measure the first *visible* item,
    // or a hidden 0×0 rect reports left=0 and the brand/nav gap goes negative.
    const navFirst = [...nav.querySelectorAll("a, button")].find(
      (el) => el.getBoundingClientRect().width > 0
    );
    const firstRect = navFirst?.getBoundingClientRect();

    const brandNavGap = firstRect && brandRect ? firstRect.left - brandRect.right : 0;
    const navUtilGap = utilRect.left - navRect.right;
    const logos = [...document.querySelectorAll('[data-testid="header-brand-lockup"] img')];
    const visibleLogos = logos.filter((img) => img.getBoundingClientRect().width > 0);

    return {
      brandNavGap,
      navUtilGap,
      brandNavOverlap: firstRect && brandRect ? brandRect.right > firstRect.left - 2 : false,
      lockupNavOverlap: firstRect ? lockupRect.right > firstRect.left - 2 : false,
      navUtilOverlap: navRect.right > utilRect.left - 2,
      visibleLogos: visibleLogos.length,
      brandLayoutWidth: brandRect?.width ?? 0,
    };
  });

  assert.ok(metrics.brandLayoutWidth > 80, `${lang}@${width}px: brand column collapsed (${metrics.brandLayoutWidth})`);
  assert.ok(metrics.brandNavGap >= 8, `${lang}@${width}px: brand/nav gap ${metrics.brandNavGap}`);
  assert.ok(!metrics.brandNavOverlap, `${lang}@${width}px: brand overlaps nav`);
  assert.ok(!metrics.lockupNavOverlap, `${lang}@${width}px: lockup overlaps nav`);
  assert.ok(!metrics.navUtilOverlap, `${lang}@${width}px: nav overlaps utilities`);
  assert.equal(metrics.visibleLogos, 1, `${lang}@${width}px: expected one visible logo`);
}

test.describe("desktop header brand vs nav", () => {
  for (const lang of LOCALES) {
    for (const width of WIDTHS) {
      test(`${lang} @ ${width}px`, async ({ page }) => {
        await setLocale(page, lang);
        await page.setViewportSize({ width, height: 800 });
        await page.goto("/", { waitUntil: "networkidle" });
        await assertDesktopHeader(page, lang, width);
      });
    }
  }
});
