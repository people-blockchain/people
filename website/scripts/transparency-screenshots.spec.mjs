/**
 * Pre-merge visual evidence for /transparency:
 *
 *   - the page is captured at 360 / 390 / 1280 in BOTH themes;
 *   - no horizontal overflow and no section left mid-reveal;
 *   - the page raises no JavaScript error and no console error of its own.
 *
 * /transparency is half editorial and half live data. Where a data source is
 * not reachable (no database, no node RPC — the usual state of a CI checkout),
 * the corresponding block must be ABSENT rather than rendered with zeros, so a
 * failed request for those endpoints is expected here and is reported instead
 * of failing the run. Any other console error, and every uncaught page error,
 * still fails: the point is that graceful degradation is quiet, not that the
 * page is allowed to throw.
 *
 * Russian is the captured locale — it is the longer of the two authored copies
 * and therefore the tighter layout; English is covered by the hero spec.
 *
 *   PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test \
 *     --config playwright.transparency-screenshots.config.mjs
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.TRANSPARENCY_BASE ?? "http://127.0.0.1:3000";
const outDir =
  process.env.TRANSPARENCY_DIR ??
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../docs/pr-evidence/transparency",
  );

const ROUTE = "/transparency";
const WIDTHS = [360, 390, 1280];
const THEMES = ["light", "dark"];

/** Live-data endpoints whose failure the page is designed to swallow. */
const OPTIONAL_DATA = /\/api\/(?:founders\/(?:transparency|report|lookup)|network)(?:[/?]|$)/;

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`transparency ru ${theme} @ ${width}`, async ({ page }) => {
      const consoleErrors = [];
      const pageErrors = [];
      /** Console "failed to load resource" lines, matched against real responses below. */
      let resourceFailures = 0;
      /** Optional data endpoints that actually answered with a 4xx/5xx. */
      const degradedResponses = [];
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        if (/Failed to load resource/i.test(text)) {
          resourceFailures += 1;
          return;
        }
        consoleErrors.push(text);
      });
      page.on("response", (response) => {
        const status = response.status();
        if (status < 400) return;
        const url = response.url();
        // 429 is expected too: every live block is behind its own rate limit.
        degradedResponses.push({ status, url, optional: OPTIONAL_DATA.test(url) });
      });
      page.on("pageerror", (error) => pageErrors.push(String(error)));

      await page.addInitScript((value) => {
        try {
          localStorage.setItem("ovn_lang", "ru");
          localStorage.setItem("ovn_theme", value);
        } catch {
          /* ignore */
        }
      }, theme);

      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}${ROUTE}`, { waitUntil: "networkidle" });
      // Walk the page once so lazy sections mount, then return to the top.
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
        const faded = Array.from(document.querySelectorAll(".reveal")).filter(
          (el) => Number(getComputedStyle(el).opacity) < 0.99,
        ).length;
        const viewport = document.documentElement.clientWidth;
        // The shared header's utility cluster overflows in Russian at 1280 on
        // every route (pre-existing, see site-fixes-screenshots.spec.mjs), so
        // measure the document without it.
        const header = document.querySelector("header");
        const restore = header ? header.style.display : null;
        if (header) header.style.display = "none";
        void document.documentElement.offsetWidth;
        const contentOverflow = document.documentElement.scrollWidth - viewport;
        if (header) header.style.display = restore ?? "";
        return {
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
          contentOverflow,
          faded,
          title: document.title,
        };
      });

      expect(state.theme, `theme not applied`).toBe(theme);
      expect(state.contentOverflow, `horizontal overflow`).toBeLessThanOrEqual(2);
      expect(state.faded, `sections captured mid-reveal`).toBe(0);
      // The tab title stays on the server's locale for every route in this Next version
      // (DocumentTitle's swap does not stick — reproduced on /tokenomics and /how-it-works
      // too), so this only asserts the route got its own title and not the homepage's.
      expect(state.title).toMatch(/transparency|прозрачность/i);
      expect(state.title).not.toBe("PEOPLE Blockchain");

      await page.screenshot({
        path: path.join(outDir, `transparency-ru-${width}-${theme}.jpg`),
        fullPage: true,
        type: "jpeg",
        quality: 72,
      });

      expect(pageErrors, `uncaught page errors`).toEqual([]);
      expect(consoleErrors, `console errors`).toEqual([]);

      // A swallowed fetch still logs a "failed to load resource" console line in Chromium,
      // so those are attributed to real responses instead of being ignored: every one must
      // be explained by a 4xx/5xx from a live-data endpoint. A missing image or a broken
      // /_next/ chunk keeps its console error and fails the run here.
      const unexplained = degradedResponses.filter((entry) => !entry.optional);
      if (unexplained.length) console.error("unexpected failed responses", unexplained);
      expect(unexplained, `unexpected failed responses`).toEqual([]);
      expect(
        resourceFailures,
        `${resourceFailures} failed resources but only ${degradedResponses.length} failed responses`,
      ).toBeLessThanOrEqual(degradedResponses.length);
      if (degradedResponses.length) {
        console.log(
          `degraded data sources at ${width}/${theme}: ` +
            degradedResponses.map((entry) => `${entry.status} ${entry.url}`).join(", "),
        );
      }
    });
  }
}

test("transparency page states the required facts and hides empty live blocks", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ovn_lang", "ru");
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${base}${ROUTE}`, { waitUntil: "networkidle" });

  // Genesis split: the six buckets of the fixed supply, straight from tokenomics.
  const split = page.getByTestId("transparency-split").locator("li");
  await expect(split).toHaveCount(6);
  const splitText = await page.getByTestId("transparency-split").innerText();
  for (const pct of ["35%", "20%", "15%", "10%", "5%"]) {
    expect(splitText).toContain(pct);
  }

  // Treasury is future tense and carries no multisig threshold or address.
  const treasury = await page.getByTestId("transparency-treasury").innerText();
  expect(treasury).toContain("мультисиг");
  expect(treasury, "no treasury address may be published yet").not.toMatch(/0x[0-9a-fA-F]{6,}/);
  expect(treasury, "no multisig threshold may be published").not.toMatch(/\d\s*(из|of)\s*\d/);

  // The audit block is a placeholder until a real report exists.
  const audit = await page.getByTestId("transparency-audit").innerText();
  expect(audit).toContain("аудит");
  expect(audit).not.toContain("независим");
  await expect(page.getByTestId("transparency-audit-slot")).toBeVisible();

  // Team vesting, as specified.
  const tokenomics = await page.getByTestId("transparency-tokenomics").innerText();
  expect(tokenomics).toContain("10%");
  expect(tokenomics).toContain("24");

  // With no data source reachable the leaderboard is absent, not empty.
  const ambassadors = page.getByTestId("transparency-ambassadors");
  const rows = page.getByTestId("transparency-ambassador-row");
  if ((await ambassadors.count()) > 0) {
    expect(await rows.count()).toBeGreaterThan(0);
  } else {
    expect(await rows.count()).toBe(0);
  }
});
