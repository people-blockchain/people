/**
 * /litepaper: Whitepaper button visible, version line, changelog; no horizontal overflow.
 * en/ru × light/dark × 360/390/1280. Plus: SSR body follows locale, language
 * switcher re-renders it, and no locale (except ru) ever renders Cyrillic.
 */
import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const OUT =
  process.env.LITEPAPER_SHOT_DIR ??
  path.resolve("docs/screenshots/litepaper-whitepaper");

const WIDTHS = [
  { width: 360, height: 740, label: "360" },
  { width: 390, height: 844, label: "390" },
  { width: 1280, height: 900, label: "1280" },
];

const CHART_TESTIDS = [
  "litepaper-allocation-donut",
  "litepaper-fee-flow",
  "litepaper-buyback-loop",
  "litepaper-team-vesting",
  "litepaper-founders-payout",
  "litepaper-roadmap",
  "litepaper-verification-levels",
  "litepaper-differ-table",
];

// Chromium derives the navigation request's Accept-Language header from the
// context's `locale` option, not from page.setExtraHTTPHeaders() — the header
// override is silently ignored for top-level navigations. Every test below
// that needs the server to see a specific Accept-Language sets `locale` on a
// fresh browser context instead.
const CONTEXT_LOCALE = {
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  pt: "pt-PT",
  it: "it-IT",
  tr: "tr-TR",
  vi: "vi-VN",
  id: "id-ID",
  zh: "zh-CN",
  ar: "ar-SA",
  ru: "ru-RU",
};

async function newLocalePage(browser, lang) {
  const context = await browser.newContext({ locale: CONTEXT_LOCALE[lang] });
  const page = await context.newPage();
  return { context, page };
}

async function setPrefs(page, { lang, theme }) {
  await page.addInitScript(
    ({ lang: l, theme: t }) => {
      try {
        localStorage.setItem("people_lang", l);
        localStorage.setItem("people_theme", t);
        document.documentElement.classList.toggle("dark", t === "dark");
        document.documentElement.dataset.theme = t;
      } catch {
        /* ignore */
      }
    },
    { lang, theme },
  );
}

const CYRILLIC = /[Ѐ-ӿ]/;

// Every shipped locale except ru must be fully translated — no leftover
// Russian body text ("mixed" locales), regardless of which section it's in.
const NON_RUSSIAN_LANGS = ["en", "de", "es", "fr", "pt", "it", "tr", "vi", "id", "zh", "ar"];

for (const lang of NON_RUSSIAN_LANGS) {
  test(`litepaper has no Cyrillic text: ${lang}`, async ({ browser }) => {
    const { context, page } = await newLocalePage(browser, lang);
    await page.goto("/litepaper", { waitUntil: "domcontentloaded" });
    const bodyText = await page.locator("body").innerText();
    const match = bodyText.match(CYRILLIC);
    expect(match, `found Cyrillic character ${match?.[0]} rendered for locale "${lang}"`).toBeNull();
    await context.close();
  });
}

// First `## ` heading of each content/litepaper/<lang>.md — proves the server
// picked that locale's markdown, not just the chrome strings around it.
const LOCALE_AT_A_GLANCE_HEADING = {
  en: "At a glance",
  de: "Auf einen Blick",
  es: "De un vistazo",
  ru: "Вкратце",
};

for (const lang of Object.keys(LOCALE_AT_A_GLANCE_HEADING)) {
  test(`litepaper SSR body follows locale: ${lang}`, async ({ browser }) => {
    const { context, page } = await newLocalePage(browser, lang);
    await page.goto("/litepaper", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: LOCALE_AT_A_GLANCE_HEADING[lang] })).toBeVisible();
    for (const [other, heading] of Object.entries(LOCALE_AT_A_GLANCE_HEADING)) {
      if (other === lang) continue;
      await expect(page.getByText(heading, { exact: true })).toHaveCount(0);
    }
    await context.close();
  });
}

test("litepaper language switcher re-renders SSR body (not stuck on Accept-Language locale)", async ({ browser }) => {
  const { context, page } = await newLocalePage(browser, "ru");
  await page.goto("/litepaper", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: LOCALE_AT_A_GLANCE_HEADING.ru })).toBeVisible();

  // Desktop language trigger shows the active locale's short code (e.g. "RU").
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: /language|язык/i }).first().click();
  await page.getByRole("button", { name: /English/ }).first().click();

  await expect(page.getByRole("heading", { name: LOCALE_AT_A_GLANCE_HEADING.en })).toBeVisible();
  await expect(page.getByText(LOCALE_AT_A_GLANCE_HEADING.ru, { exact: true })).toHaveCount(0);

  // Regression: cookie must win over the original Accept-Language on refresh,
  // or the body stays Russian while chrome strings go English ("mixed" bug).
  const bodyText = await page.locator("body").innerText();
  const match = bodyText.match(CYRILLIC);
  expect(match, `found Cyrillic character ${match?.[0]} after switching to English`).toBeNull();
  await context.close();
});

test("litepaper language switcher works from a cold English start (incognito, no cookie yet)", async ({
  browser,
}) => {
  const { context, page } = await newLocalePage(browser, "en");
  await page.goto("/litepaper", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: LOCALE_AT_A_GLANCE_HEADING.en })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: /language|язык/i }).first().click();
  await page.getByRole("button", { name: /Русский|Russian/i }).first().click();

  await expect(page.getByRole("heading", { name: LOCALE_AT_A_GLANCE_HEADING.ru })).toBeVisible();
  await expect(page.getByText(LOCALE_AT_A_GLANCE_HEADING.en, { exact: true })).toHaveCount(0);
  await context.close();
});

for (const lang of ["en", "ru"]) {
  for (const theme of ["light", "dark"]) {
    for (const { width, height, label } of WIDTHS) {
      test(`litepaper whitepaper @ ${lang} ${theme} ${label}`, async ({ browser }) => {
        fs.mkdirSync(OUT, { recursive: true });
        const { context, page } = await newLocalePage(browser, lang);
        await setPrefs(page, { lang, theme });
        await page.setViewportSize({ width, height });
        await page.goto("/litepaper", { waitUntil: "domcontentloaded" });

        // DownloadCard mounts twice (sticky aside lg-only + mobile footer); pick a visible one.
        const version = page.locator('[data-testid="docs-version-line"]').locator("visible=true").first();
        await expect(version).toContainText("v1.0");
        await expect(version).toContainText("11 Oct 2026");
        const wp = page.locator('[data-testid="litepaper-download-whitepaper"]').locator("visible=true").first();
        await wp.scrollIntoViewIfNeeded();
        await expect(wp).toBeVisible();
        await expect(
          page.locator('[data-testid="litepaper-whitepaper-lead"]').locator("visible=true").first(),
        ).toBeVisible();
        await expect(page.getByTestId("docs-changelog")).toBeVisible();
        await expect(page.getByTestId("docs-changelog")).toContainText("v1.0");

        for (const testId of CHART_TESTIDS) {
          const chart = page.getByTestId(testId);
          await chart.scrollIntoViewIfNeeded();
          await expect(chart).toBeVisible();
          // Chart chunk loads async; wait until children paint (svg/table OR non-empty text).
          await expect
            .poll(
              async () =>
                chart.evaluate((el) => {
                  if (el.querySelector("svg, table")) return true;
                  return (el.textContent || "").trim().length > 20;
                }),
              { timeout: 5000 },
            )
            .toBe(true);
        }
        // Locale-stable chart slots must be present (regression: English heading ids left RU/etc unmounted).
        await expect(page.locator('section[data-chart-slot="tokenomics"]')).toBeVisible();
        await expect(page.locator('section[data-chart-slot="technology"]')).toBeVisible();
        await expect(page.locator('section[data-chart-slot="differ"]')).toBeVisible();

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);

        await page.screenshot({
          path: path.join(OUT, `litepaper-${lang}-${theme}-${label}.png`),
          fullPage: false,
        });
        await context.close();
      });
    }
  }
}
