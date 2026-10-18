// LIVE smoke pass over every public nav/footer page at 360, 390 and 1280.
//
// Skipped unless LIVE_E2E=1. Checks per page: HTTP status, console/page errors
// (third-party noise listed separately), horizontal overflow, broken images,
// untranslated-key leftovers and empty states where live data should exist.
// Also exercises EN/RU switch, the theme toggle and the mobile menu.
//
// Results land in e2e/.live-smoke.json (consumed by docs/audit-final/e2e.md).

import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { LIVE_BASE_URL, VIEWPORTS, attachDiagnostics, auditPage, settleImages } from "./live-helpers.mjs";

const LIVE = process.env.LIVE_E2E === "1";
test.skip(!LIVE, "set LIVE_E2E=1 to run against the live deployment");

const SHOT_DIR = new URL("../docs/screenshots/e2e/", import.meta.url);
const RESULTS_PATH = new URL("./.live-smoke.json", import.meta.url);

// Every public page reachable from the header nav, the "More" menu and the
// footer (see src/lib/locales/en.ts nav.links / moreLinks / protocolLinks and
// src/components/Footer.tsx).
const PAGES = [
  "/",
  "/wallet",
  "/how-it-works",
  "/create",
  "/create/token",
  "/create/nft",
  "/create/contract",
  "/discover",
  "/founders",
  "/roadmap",
  "/agents",
  "/tokenomics",
  "/explorer",
  "/explorer/tokens",
  "/explorer/nfts",
  "/explorer/contracts",
  "/swap",
  "/staking",
  "/fees",
  "/transparency",
  "/docs",
  "/login",
  "/partner",
  "/privacy",
  "/terms",
];

const HARD_EMPTY = ["not configured", "contracts not deployed", "failed to load", "something went wrong"];
const SOFT_EMPTY = ["coming soon", "unavailable", "no data available"];

const results = [];
const record = (page_, viewport, result, notes = "") => {
  results.push({ page: page_, viewport, result, notes });
  // eslint-disable-next-line no-console
  console.log(`[${result}] ${page_} @${viewport}${notes ? ` — ${notes}` : ""}`);
};

// Pages where a "not live yet" / staged state is expected rather than a bug.
const EXPECTED_EMPTY = { "/staking": ["unavailable"] };

test.describe("live smoke", () => {
  test.describe.configure({ mode: "default" });
  let context;
  let page;
  let diag;

  test.beforeAll(async ({ browser }) => {
    mkdirSync(SHOT_DIR, { recursive: true });
    context = await browser.newContext({
      baseURL: LIVE_BASE_URL,
      viewport: { width: 1280, height: 800 },
      reducedMotion: "reduce",
      locale: "en-US",
    });
    page = await context.newPage();
    diag = attachDiagnostics(page);
  });

  test.afterAll(async () => {
    if (diag) {
      results.push({
        page: "diagnostics",
        viewport: "all",
        result: "info",
        notes: JSON.stringify({
          consoleErrors: [...new Set(diag.consoleErrors)].slice(0, 30),
          pageErrors: [...new Set(diag.pageErrors)].slice(0, 30),
          thirdParty: [...new Set(diag.thirdParty)].slice(0, 30),
          failedRequests: [...new Set(diag.failedRequests)].slice(0, 30),
        }),
      });
    }
    writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
    await context?.close();
  });

  for (const vp of VIEWPORTS) {
    test(`pages at ${vp.name}`, async () => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const path of PAGES) {
        const beforeConsole = diag.consoleErrors.length;
        const beforePageErrors = diag.pageErrors.length;
        let status = 0;
        try {
          const res = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 45_000 });
          status = res?.status() ?? 0;
          await settleImages(page);
        } catch (err) {
          record(path, vp.name, "FAIL", `navigation: ${err.message}`);
          continue;
        }
        const audit = await auditPage(page);
        const pageConsole = [
          ...diag.consoleErrors.slice(beforeConsole),
          ...diag.pageErrors.slice(beforePageErrors),
        ];
        const errors = pageConsole.length;
        const overflow = audit.overflow.scrollWidth - audit.overflow.innerWidth;
        const hardEmpty = audit.emptyStates.filter(
          (p) => HARD_EMPTY.includes(p) && !(EXPECTED_EMPTY[path] ?? []).includes(p),
        );
        const softEmpty = audit.emptyStates.filter((p) => SOFT_EMPTY.includes(p));
        const problems = [];
        if (status >= 400) problems.push(`HTTP ${status}`);
        if (errors > 0) problems.push(`${errors} console error(s): ${pageConsole.slice(0, 2).join(" | ").slice(0, 220)}`);
        if (overflow > 1) problems.push(`overflow +${overflow}px`);
        if (audit.brokenImages.length)
          problems.push(
            `${audit.brokenImages.length} broken image(s): ${audit.brokenImages
              .slice(0, 3)
              .map((i) => i.src.split("/").pop() || i.src)
              .join(", ")}`,
          );
        if (audit.untranslatedKeys.length) problems.push(`keys: ${audit.untranslatedKeys.slice(0, 4).join(", ")}`);
        if (hardEmpty.length) problems.push(`empty state: ${hardEmpty.join(", ")}`);
        if (problems.length) {
          await page
            .screenshot({ path: new URL(`fail-smoke-${vp.name}-${path.replace(/\W+/g, "_")}.png`, SHOT_DIR).pathname })
            .catch(() => {});
        }
        record(
          path,
          vp.name,
          problems.length ? "FAIL" : softEmpty.length ? "WARN" : "PASS",
          [...problems, ...softEmpty.map((p) => `soft: ${p}`)].join(" · "),
        );
      }
    });
  }

  test("EN/RU switch, theme toggle, mobile menu", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // EN → RU
    await page.getByRole("button", { name: "Language" }).first().click();
    await page.getByRole("button", { name: /Русский/ }).first().click();
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("ru");
    const ruNav = await page.getByRole("link", { name: "Как это работает" }).first().isVisible().catch(() => false);
    const ruStored = await page.evaluate(() => localStorage.getItem("people_lang"));
    record("EN→RU switch", "1280", ruNav && ruStored === "ru" ? "PASS" : "FAIL", `nav=${ruNav} stored=${ruStored}`);

    // RU → EN
    await page.getByRole("button", { name: "Язык" }).first().click().catch(async () => {
      await page.getByRole("button", { name: /Language|Язык/ }).first().click();
    });
    await page.getByRole("button", { name: /English/ }).first().click();
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("en");
    record("RU→EN switch", "1280", "PASS", "");

    // Theme toggle
    const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    await page.getByRole("button", { name: "Toggle colour theme" }).first().click();
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).not.toBe(before);
    const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    const persisted = await page.evaluate(() => localStorage.getItem("people_theme"));
    record("theme toggle", "1280", after === persisted ? "PASS" : "FAIL", `${before} → ${after} stored=${persisted}`);

    // Mobile menu
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Menu" }).first().click();
    const menu = page.locator("#mobile-menu");
    await expect(menu).toBeVisible();
    const audit = await auditPage(page);
    const overflow = audit.overflow.scrollWidth - audit.overflow.innerWidth;
    const links = await menu.getByRole("link").count();
    record("mobile menu", "360", links > 3 && overflow <= 1 ? "PASS" : "FAIL", `links=${links} overflow=${overflow}px`);
    await page.getByRole("button", { name: "Close menu" }).first().click();
    await expect(menu).toHaveCount(0);
    record("mobile menu closes", "360", "PASS", "");
  });
});
