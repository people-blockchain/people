import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";

const LOCALES = ["en", "ru", "de", "es", "fr", "it", "pt", "tr", "vi", "zh", "id", "ar"];

const DESKTOP_WIDTHS = [1024, 1280, 1440, 1920];

const ARTIFACT_ROOT = process.env.HERO_SCREENSHOT_DIR ?? "/opt/cursor/artifacts";

async function writableArtifactRoot() {
  try {
    await mkdir(ARTIFACT_ROOT, { recursive: true });
    return ARTIFACT_ROOT;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "";
    if (code !== "EACCES" && code !== "EPERM" && code !== "EROFS") throw error;
    const fallback = path.join(tmpdir(), "people-hero-artifacts");
    await mkdir(fallback, { recursive: true });
    return fallback;
  }
}

async function setLocale(page, lang) {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("people_lang", value);
    } catch {
      /* ignore */
    }
  }, lang);
}

async function waitForHeroFit(page) {
  await page.waitForSelector('[data-testid="hero-headline"][data-hero-fit="ready"]', {
    timeout: 15_000,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(50);
}

async function assertHeroLayout(page, lang, viewportLabel) {
  await waitForHeroFit(page);

  const column = page.getByTestId("hero-copy-column");
  const headline = page.getByTestId("hero-headline");
  const card = page.getByTestId("hero-visual-card");

  await expect(column).toBeVisible();
  await expect(headline).toBeVisible();

  const measurement = await page.evaluate(() => {
    const columnEl = document.querySelector('[data-testid="hero-copy-column"]');
    const lines = [...document.querySelectorAll('[data-testid="hero-headline-line"]')];
    if (!columnEl || !lines.length) {
      return { ok: false, issues: ["missing column or headline lines"] };
    }

    const columnRect = columnEl.getBoundingClientRect();
    const slack = 1;
    const issues = [];

    for (let i = 0; i < lines.length; i++) {
      const el = lines[i];
      if (el.scrollWidth > el.clientWidth + slack) {
        issues.push(
          `line ${i}: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth} (text: ${el.textContent?.slice(0, 40)})`
        );
      }

      const range = document.createRange();
      range.selectNodeContents(el);
      const textRect = range.getBoundingClientRect();
      if (textRect.right > columnRect.right + slack) {
        issues.push(
          `line ${i}: text right ${textRect.right.toFixed(2)} > column right ${columnRect.right.toFixed(2)}`
        );
      }
      if (textRect.left < columnRect.left - slack) {
        issues.push(
          `line ${i}: text left ${textRect.left.toFixed(2)} < column left ${columnRect.left.toFixed(2)}`
        );
      }
    }

    const headlineEl = document.querySelector('[data-testid="hero-headline"]');
    const headlineBox = headlineEl?.getBoundingClientRect();
    const cardEl = document.querySelector('[data-testid="hero-visual-card"]');
    const cardBox = cardEl?.getBoundingClientRect();
    let intersectsCard = false;
    if (headlineBox && cardBox && cardEl && getComputedStyle(cardEl).display !== "none") {
      const visible =
        cardBox.width > 0 &&
        cardBox.height > 0 &&
        cardEl.offsetParent !== null &&
        getComputedStyle(cardEl).visibility !== "hidden";
      if (visible) {
        intersectsCard =
          headlineBox.x < cardBox.x + cardBox.width &&
          headlineBox.x + headlineBox.width > cardBox.x &&
          headlineBox.y < cardBox.y + cardBox.height &&
          headlineBox.y + headlineBox.height > cardBox.y;
      }
    }

    if (intersectsCard) {
      issues.push("headline bounding box intersects visual card");
    }

    return { ok: issues.length === 0, issues };
  });

  expect(measurement.ok, `${lang} ${viewportLabel}: ${measurement.issues?.join("; ")}`).toBe(true);
}

test.describe("hero headline stays inside left column", () => {
  for (const lang of LOCALES) {
    for (const width of DESKTOP_WIDTHS) {
      test(`${lang} @ ${width}px desktop`, async ({ page }) => {
        await setLocale(page, lang);
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/", { waitUntil: "networkidle" });
        await assertHeroLayout(page, lang, `${width}`);
      });
    }

    test(`${lang} @ iPhone 390`, async ({ page }) => {
      await setLocale(page, lang);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/", { waitUntil: "networkidle" });
      await assertHeroLayout(page, lang, "390");
    });
  }
});

test.describe("hero headline screenshots", () => {
  const shots = [
    { lang: "ru", width: 1024, height: 900, name: "ru-desktop-1024" },
    { lang: "ru", width: 1280, height: 900, name: "ru-desktop-1280" },
    { lang: "fr", width: 1024, height: 900, name: "fr-desktop-1024" },
    { lang: "fr", width: 1280, height: 900, name: "fr-desktop-1280" },
    { lang: "de", width: 1024, height: 900, name: "de-desktop-1024" },
    { lang: "de", width: 1280, height: 900, name: "de-desktop-1280" },
    { lang: "ru", width: 390, height: 844, name: "ru-iphone-390" },
  ];

  for (const shot of shots) {
    test(`capture ${shot.name}`, async ({ page }) => {
      const phase = process.env.HERO_SCREENSHOT_PHASE ?? "after";
      await setLocale(page, shot.lang);
      await page.setViewportSize({ width: shot.width, height: shot.height });
      await page.goto("/", { waitUntil: "networkidle" });
      await waitForHeroFit(page);
      const hero = page.locator("section").filter({ has: page.locator("h1") }).first();
      const dir = path.join(await writableArtifactRoot(), "screenshots", phase);
      await mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `hero-${shot.name}-${phase}.png`);
      await hero.screenshot({ path: filePath });
      await writeFile(
        path.join(dir, `hero-${shot.name}-${phase}.json`),
        JSON.stringify({ lang: shot.lang, width: shot.width, height: shot.height, phase }, null, 2)
      );
    });
  }
});
