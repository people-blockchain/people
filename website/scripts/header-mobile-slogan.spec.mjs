import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";

const LOCALES = ["en", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar", "ru"];
// Below `md` (768px) the header shows only the compact mobile lockup; the
// tagline + localized slogan bundle starts at `md` (Navbar.tsx, globals.css).
const WIDTHS_NARROW = [320, 390, 412, 640, 720];
const WIDTHS_SLOGAN = [768, 900];

// Screenshots are opt-in: CI runners cannot write to arbitrary absolute paths.
const ARTIFACT_ROOT = process.env.HEADER_SCREENSHOT_DIR ?? "";

async function setLocale(page, lang) {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("ovn_lang", value);
    } catch {
      /* ignore */
    }
  }, lang);
}

async function assertHeaderSlogan(page, lang, width) {
  const slogan = page.getByTestId("header-brand-slogan");
  await expect(slogan).toBeVisible();
  const expected = await slogan.getAttribute("data-expected");
  assert.ok(expected, `${lang}@${width}px: missing data-expected on slogan`);

  const metrics = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="header-brand-slogan"]');
    const header = document.querySelector("header");
    const utilities = document.querySelector("header .ml-auto");
    const lockup = [...document.querySelectorAll('[data-testid="header-brand-lockup"] img')].find(
      (img) => {
        const style = getComputedStyle(img);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = img.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }
    );
    if (!el || !header || !utilities || !lockup) {
      return { ok: false, reason: "missing elements" };
    }

    const style = getComputedStyle(el);
    const lineHeight =
      style.lineHeight === "normal"
        ? parseFloat(style.fontSize) * 1.2
        : parseFloat(style.lineHeight);
    const lines = Math.round(el.getBoundingClientRect().height / lineHeight);

    const sloganRect = el.getBoundingClientRect();
    const utilRect = utilities.getBoundingClientRect();
    const lockupRect = lockup.getBoundingClientRect();
    const row = header.querySelector(":scope > div");
    const overlapsUtilities = sloganRect.right > utilRect.left - 2;
    const truncated = el.scrollWidth > el.clientWidth + 1;
    const leftAlignedWithIcon = Math.abs(sloganRect.left - lockupRect.left) <= 2;

    const bundle = document.querySelector(".header-brand-bundle");
    const rowRect = row?.getBoundingClientRect();
    const bundleRect = bundle?.getBoundingClientRect();

    // The bundle box includes the lockup raster's transparent margin and the
    // slogan's line-height, so it may slightly exceed the bar (~5px at md).
    // What matters is that it stays vertically centred and does not spill far.
    let unevenVertical = false;
    if (rowRect && bundleRect) {
      const topPad = bundleRect.top - rowRect.top;
      const bottomPad = rowRect.bottom - bundleRect.bottom;
      unevenVertical = topPad < -6 || bottomPad < -6 || Math.abs(topPad - bottomPad) > 2;
    }

    return {
      lines,
      overlapsUtilities,
      truncated,
      leftAlignedWithIcon,
      unevenVertical,
      text: el.textContent?.trim() ?? "",
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      whiteSpace: style.whiteSpace,
      textOverflow: style.textOverflow,
    };
  });

  assert.equal(metrics.text, expected, `${lang}@${width}px: slogan text mismatch`);
  assert.equal(metrics.whiteSpace, "nowrap", `${lang}@${width}px: must not wrap`);
  assert.ok(metrics.lines <= 1, `${lang}@${width}px: expected one line (${metrics.lines})`);
  assert.ok(!metrics.truncated, `${lang}@${width}px: slogan truncated`);
  assert.ok(
    metrics.leftAlignedWithIcon,
    `${lang}@${width}px: slogan not left-aligned with icon (scroll ${metrics.scrollWidth}/${metrics.clientWidth})`
  );
  assert.ok(!metrics.overlapsUtilities, `${lang}@${width}px: overlaps utility buttons`);
  assert.ok(
    !metrics.unevenVertical,
    `${lang}@${width}px: uneven vertical padding in header row`
  );
}

test.describe("narrow mobile header (compact lockup)", () => {
  for (const lang of LOCALES) {
    for (const width of WIDTHS_NARROW) {
      test(`${lang} @ ${width}px — compact lockup, utilities visible`, async ({ page }) => {
        await setLocale(page, lang);
        await page.setViewportSize({ width, height: 720 });
        await page.goto("/");
        await expect(page.getByTestId("header-brand-mobile")).toBeVisible();
        await expect(
          page.getByTestId("header-brand-lockup-mobile").locator("img").locator("visible=true"),
        ).toHaveCount(1);
        await expect(page.getByTestId("header-brand-lockup")).toBeHidden();
        await expect(page.getByTestId("header-brand-slogan")).toBeHidden();
        await expect(page.locator(".header-utilities")).toBeVisible();
      });
    }
  }
});

test.describe("mobile header brand slogan", () => {
  for (const lang of LOCALES) {
    for (const width of WIDTHS_SLOGAN) {
      test(`${lang} @ ${width}px — full text, icon-aligned`, async ({ page }) => {
        await setLocale(page, lang);
        await page.setViewportSize({ width, height: 720 });
        await page.goto("/");
        await expect(page.getByTestId("header-brand-slogan")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(120);
        await page.evaluate(() => {
          window.dispatchEvent(new Event("resize"));
        });
        await page.waitForTimeout(40);

        await assertHeaderSlogan(page, lang, width);

        if (!ARTIFACT_ROOT) return;
        const dir = path.join(ARTIFACT_ROOT, lang);
        await mkdir(dir, { recursive: true });
        await page.screenshot({
          path: path.join(dir, `header-${width}.png`),
          fullPage: false,
        });
      });
    }
  }
});
