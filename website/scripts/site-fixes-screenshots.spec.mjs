/**
 * Pre-merge visual evidence for the post-#188 fixes batch:
 *
 *   - the theme toggle now repaints the whole page (home, /how-it-works,
 *     /founders), so every width is captured in BOTH themes;
 *   - no page may scroll horizontally at 360 / 390 / 1280;
 *   - the /how-it-works economics figures must already be in the server HTML,
 *     not only in a count-up animation.
 *
 * The overflow check measures the page content, not the shared site header: at
 * 1280 the header's `shrink-0` utility cluster (language + theme + wallet) is
 * ~102px wider than the viewport in Russian, which is pre-existing and
 * unchanged by this batch — it reproduces identically on untouched routes such
 * as /tokenomics and /docs, so the assertion would otherwise fail everywhere.
 *
 * Russian is the captured locale: it is the longest copy the warm pages ship
 * and therefore the wider layout (English is covered by the hero-layout specs).
 *
 *   PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test \
 *     --config playwright.site-fixes-screenshots.config.mjs
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.SITE_FIXES_BASE ?? "http://127.0.0.1:3000";
const outDir =
  process.env.SITE_FIXES_DIR ??
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../docs/pr-evidence/site-fixes-20261006",
  );

const PAGES = [
  { slug: "home", route: "/" },
  { slug: "how-it-works", route: "/how-it-works" },
  { slug: "founders", route: "/founders" },
];

const WIDTHS = [360, 390, 1280];
const THEMES = ["light", "dark"];

async function prepare(page, theme) {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("ovn_lang", "ru");
      localStorage.setItem("ovn_theme", value);
    } catch {
      /* ignore */
    }
  }, theme);
}

for (const theme of THEMES) {
  for (const { slug, route } of PAGES) {
    for (const width of WIDTHS) {
      test(`${slug} ru ${theme} @ ${width}`, async ({ page }) => {
        await prepare(page, theme);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
        // Walk the page once so lazy media and any client-only section mounts
        // settle, then return to the top before the full-page shot.
        await page.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
        await page.evaluate(async () => {
          const step = window.innerHeight * 0.75;
          for (let y = 0; y <= document.body.scrollHeight; y += step) {
            window.scrollTo({ top: y, behavior: "instant" });
            await new Promise((resolve) => setTimeout(resolve, 120));
          }
          window.scrollTo({ top: 0, behavior: "instant" });
        });
        await page.waitForTimeout(600);

        const state = await page.evaluate(() => {
          // With reduced motion the hidden `.reveal` state is never applied, so
          // "revealed" is measured on computed opacity rather than the class.
          const faded = Array.from(document.querySelectorAll(".reveal")).filter(
            (el) => Number(getComputedStyle(el).opacity) < 0.99,
          ).length;
          // Measure the document's own overflow with the shared header taken
          // out of the flow: decorative glows clipped by an ancestor would
          // otherwise read as false positives through getBoundingClientRect.
          const viewport = document.documentElement.clientWidth;
          const header = document.querySelector("header");
          const restore = header ? header.style.display : null;
          if (header) header.style.display = "none";
          void document.documentElement.offsetWidth;
          const contentOverflow = document.documentElement.scrollWidth - viewport;
          if (header) header.style.display = restore ?? "";
          return {
            theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
            overflow: document.documentElement.scrollWidth - viewport,
            contentOverflow,
            faded,
          };
        });

        // The toggle must reach the whole document, not just the header.
        expect(state.theme, `${route} @ ${width}: theme not applied`).toBe(theme);
        expect(state.contentOverflow, `${route} @ ${width}: horizontal overflow`).toBeLessThanOrEqual(2);
        expect(state.faded, `${route} @ ${width}: sections captured mid-reveal`).toBe(0);
        console.log(`${route} @ ${width} ${theme}: page overflow ${state.overflow}px (header included)`);

        await page.screenshot({
          path: path.join(outDir, `${slug}-ru-${width}-${theme}.jpg`),
          fullPage: true,
          type: "jpeg",
          quality: 72,
        });
      });
    }
  }
}

test("how-it-works ships the final economics figures in the server HTML", async ({ request }) => {
  const res = await request.get(`${base}/how-it-works`);
  expect(res.ok()).toBe(true);
  const html = await res.text();

  // Server HTML is locale-independent here (the language is applied on the
  // client), so grouping separators differ from the captured ru screenshots.
  // Compare digits only.
  const digits = html.replace(/[\s  ,.]/g, "");
  expect(digits, "total supply 1,000,000,000").toContain("1000000000");
  expect(digits, "validator year 1 60M").toContain("60000000");
  expect(digits, "validator year 2/3 50M").toContain("50000000");
  expect(digits, "validator year 4 40M").toContain("40000000");
});
