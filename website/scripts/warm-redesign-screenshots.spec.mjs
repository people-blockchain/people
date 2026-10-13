/**
 * Pre-merge visual evidence for the homepage + /how-it-works warm redesign.
 *
 * Captures the same three widths for the two redesigned pages and for
 * /founders, which is the visual reference they were built against, so the
 * three can be compared side by side.
 *
 *   PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test \
 *     --config playwright.warm-screenshots.config.mjs
 */
import { expect, test } from "@playwright/test";
import path from "node:path";

const base = process.env.WARM_SCREENSHOT_BASE ?? "http://127.0.0.1:3000";
const outDir = process.env.WARM_SCREENSHOT_DIR ?? path.resolve("docs/screenshots/warm-redesign");

const PAGES = [
  { slug: "home", route: "/" },
  { slug: "how-it-works", route: "/how-it-works" },
  { slug: "founders", route: "/founders" },
];

const WIDTHS = [
  { width: 360, label: "360" },
  { width: 390, label: "390" },
  { width: 1280, label: "1280" },
];

async function setLocale(page, lang) {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("ovn_lang", value);
    } catch {
      /* ignore */
    }
  }, lang);
}

for (const lang of ["en", "ru"]) {
  for (const { slug, route } of PAGES) {
    for (const { width, label } of WIDTHS) {
      test(`${slug} ${lang} @ ${label}`, async ({ page }) => {
        await setLocale(page, lang);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
        // Instant scrolling only: a smooth-scroll page never reaches the middle
        // sections, so their IntersectionObserver reveals never fire and the
        // capture below would show empty bands.
        await page.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
        // Walk the page so every reveal-on-scroll section is rendered, then
        // come back. Screenshots of half-revealed pages are worthless evidence.
        await page.evaluate(async () => {
          const step = window.innerHeight * 0.75;
          for (let y = 0; y <= document.body.scrollHeight; y += step) {
            window.scrollTo({ top: y, behavior: "instant" });
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          window.scrollTo({ top: 0, behavior: "instant" });
        });
        await page.waitForTimeout(800);
        const hidden = await page.evaluate(
          () => document.querySelectorAll(".reveal:not(.is-visible)").length,
        );
        expect(hidden, `${route} @ ${label}: ${hidden} section(s) never revealed`).toBe(0);
        await page.screenshot({
          path: path.join(outDir, `${slug}-warm-${lang}-${label}.jpg`),
          fullPage: true,
          type: "jpeg",
          quality: 72,
        });
      });
    }
  }
}
